from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.ai import router as ai_router
from app.api.v1.attachments import router as attachments_router
from app.api.v1.audit import router as audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.automations import router as automations_router
from app.api.v1.columns import router as columns_router
from app.api.v1.comments import router as comments_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.projects import router as projects_router
from app.api.v1.push import router as push_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.webhooks import router as webhooks_router
from app.config import settings
from app.database import engine
from app.logging_config import configure_logging
from app.rabbitmq import rabbitmq_manager
from app.websocket_manager import ws_manager

configure_logging(settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup is cheap: migrations and seeding are one-off admin processes (`migrate` service),
    # here we only open connections to backing services.
    await ws_manager.start(settings.database_url, settings.ws_channel)
    await rabbitmq_manager.start()
    yield
    # Graceful shutdown on SIGTERM: uvicorn stops accepting requests, finishes in-flight ones,
    # then we close sockets and connections.
    await ws_manager.close_all()
    await ws_manager.stop()
    await rabbitmq_manager.stop()
    await engine.dispose()


app = FastAPI(title="Victory Group Task Scheduler", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router)
app.include_router(notifications_router)
app.include_router(attachments_router)
app.include_router(audit_router)
app.include_router(auth_router)
app.include_router(automations_router)
app.include_router(comments_router)
app.include_router(columns_router)
app.include_router(projects_router)
app.include_router(push_router)
app.include_router(tasks_router)
app.include_router(webhooks_router)


@app.get("/health")
async def health():
    """Liveness: the process is up and serving HTTP."""
    return {"status": "ok", "service": "core-api"}


@app.get("/ready")
async def ready():
    """Readiness: the replica can serve traffic — its database answers."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unavailable", "service": "core-api"})
    return {"status": "ok", "service": "core-api"}


@app.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: int):
    await ws_manager.connect(project_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(project_id, websocket)
