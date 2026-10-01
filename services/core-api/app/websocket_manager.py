"""Realtime board updates over WebSocket.

A WebSocket connection is bound to the core-api replica that accepted it, so an event
raised on one replica has to reach clients connected to the others. Events are not
sent to sockets directly: `broadcast` publishes them with PostgreSQL NOTIFY, and every
replica LISTENs on the same channel and delivers them to its own sockets. No state is
shared between replicas, and PostgreSQL is a backing service the app already depends on.

Without a running listener (unit tests, SQLite) events are delivered locally.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections import defaultdict
from typing import Any

import asyncpg
from fastapi import WebSocket

logger = logging.getLogger(__name__)

# NOTIFY payload must stay below 8000 bytes; large task bodies are trimmed to the
# fields the frontend actually reads (it refetches the board on every event anyway).
_MAX_PAYLOAD_BYTES = 7500
_SLIM_FIELDS = ("id", "task_id", "title", "project_id", "column_id")
# A hung LISTEN connection must not stall requests: give up and deliver locally
_NOTIFY_TIMEOUT_SECONDS = 2.0


def _asyncpg_dsn(database_url: str) -> str:
    return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


class WebSocketManager:
    def __init__(self):
        self._connections: dict[int, list[WebSocket]] = defaultdict(list)
        self._conn: asyncpg.Connection | None = None
        self._channel = ""
        self._dsn = ""
        self._lock = asyncio.Lock()
        self._tasks: set[asyncio.Task] = set()
        self._stopping = False

    async def connect(self, project_id: int, websocket: WebSocket):
        await websocket.accept()
        self._connections[project_id].append(websocket)

    def disconnect(self, project_id: int, websocket: WebSocket):
        if websocket in self._connections[project_id]:
            self._connections[project_id].remove(websocket)

    async def start(self, database_url: str, channel: str) -> None:
        if not database_url.startswith("postgresql"):
            logger.info("WebSocket fan-out disabled: not a PostgreSQL database, delivering events locally")
            return
        self._channel = channel
        self._dsn = _asyncpg_dsn(database_url)
        self._stopping = False
        await self._listen()

    async def _listen(self) -> None:
        # TCP keepalives let a silently dropped connection (failover, NAT) surface as an error
        conn = await asyncpg.connect(
            self._dsn,
            server_settings={"tcp_keepalives_idle": "30", "tcp_keepalives_interval": "10", "tcp_keepalives_count": "3"},
        )
        await conn.add_listener(self._channel, self._on_notify)
        conn.add_termination_listener(self._on_terminated)
        self._conn = conn
        logger.info("WebSocket fan-out listening on PostgreSQL channel %s", self._channel)

    def _on_terminated(self, _conn: Any) -> None:
        # PostgreSQL restarted or the connection dropped: fall back to local delivery and reconnect
        self._conn = None
        if not self._stopping:
            logger.warning("WebSocket fan-out connection lost, reconnecting")
            self._spawn(self._reconnect())

    async def _reconnect(self) -> None:
        delay = 1.0
        while not self._stopping and self._conn is None:
            try:
                await self._listen()
            except Exception as exc:
                logger.warning("WebSocket fan-out reconnect failed: %s", exc)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30.0)

    def _spawn(self, coro) -> None:
        task = asyncio.get_running_loop().create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def stop(self) -> None:
        self._stopping = True
        conn, self._conn = self._conn, None
        if conn is not None:
            await conn.close()

    async def close_all(self) -> None:
        """Close client sockets on shutdown so browsers reconnect to a live replica."""
        for sockets in self._connections.values():
            for ws in list(sockets):
                with contextlib.suppress(Exception):
                    await ws.close(code=1012)  # service restart
        self._connections.clear()

    async def broadcast(self, project_id: int, event: str, data: dict):
        if self._conn is None:
            await self._deliver(project_id, event, data)
            return
        payload = json.dumps({"project_id": project_id, "event": event, "data": data})
        if len(payload.encode()) > _MAX_PAYLOAD_BYTES:
            slim = {k: data[k] for k in _SLIM_FIELDS if k in data}
            payload = json.dumps({"project_id": project_id, "event": event, "data": slim})
        try:
            async with asyncio.timeout(_NOTIFY_TIMEOUT_SECONDS):
                async with self._lock:  # one asyncpg connection cannot run queries concurrently
                    await self._conn.execute("SELECT pg_notify($1, $2)", self._channel, payload)
        except TimeoutError:
            # The connection hangs without being reported dead (dropped packets, failover):
            # drop it and open a new one instead of waiting minutes for TCP to give up.
            logger.warning("WebSocket fan-out NOTIFY timed out, reconnecting; delivering %s locally", event)
            conn, self._conn = self._conn, None
            if conn is not None:
                conn.remove_termination_listener(self._on_terminated)
                conn.terminate()
                self._spawn(self._reconnect())
            await self._deliver(project_id, event, data)
        except Exception:
            logger.exception("Failed to publish WebSocket event %s, delivering locally", event)
            await self._deliver(project_id, event, data)

    def _on_notify(self, _conn: Any, _pid: int, _channel: str, payload: str) -> None:
        try:
            message = json.loads(payload)
        except ValueError:
            logger.warning("Malformed WebSocket event on channel %s", _channel)
            return
        self._spawn(self._deliver(int(message["project_id"]), message["event"], message.get("data") or {}))

    async def _deliver(self, project_id: int, event: str, data: dict):
        message = json.dumps({"event": event, "data": data})
        dead = []
        for ws in self._connections[project_id]:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(project_id, ws)


ws_manager = WebSocketManager()
