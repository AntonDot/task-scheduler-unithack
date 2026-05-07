import json
from collections import defaultdict

from fastapi import WebSocket


class WebSocketManager:
    def __init__(self):
        self._connections: dict[int, list[WebSocket]] = defaultdict(list)

    async def connect(self, project_id: int, websocket: WebSocket):
        await websocket.accept()
        self._connections[project_id].append(websocket)

    def disconnect(self, project_id: int, websocket: WebSocket):
        self._connections[project_id].remove(websocket)

    async def broadcast(self, project_id: int, event: str, data: dict):
        message = json.dumps({"event": event, "data": data})
        dead = []
        for ws in self._connections[project_id]:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections[project_id].remove(ws)


ws_manager = WebSocketManager()
