from fastapi import Depends, FastAPI, HTTPException
from fastapi import status as http_status
from fastapi.middleware.cors import CORSMiddleware

from app.clients import llm_client
from app.dependencies import verify_webhook_key
from app.schemas.webhook import DraftTextPayload, ImproveRequest, ImproveResponse, IncidentPayload, WebhookResponse
from app.services import incident_service

app = FastAPI(title="ML & Events Worker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ml-worker"}


@app.post("/webhook/incident", response_model=WebhookResponse, dependencies=[Depends(verify_webhook_key)])
async def webhook_incident(payload: IncidentPayload):
    result = await incident_service.handle_incident(payload)
    if result.get("status") == "error":
        raise HTTPException(
            status_code=http_status.HTTP_502_BAD_GATEWAY,
            detail=result.get("message", "Failed to create task in Core API"),
        )
    return WebhookResponse(**result)


@app.post("/webhook/draft-text", response_model=WebhookResponse, dependencies=[Depends(verify_webhook_key)])
async def webhook_draft_text(payload: DraftTextPayload):
    result = await incident_service.handle_draft_text(payload)
    if result.get("status") == "error":
        raise HTTPException(
            status_code=http_status.HTTP_502_BAD_GATEWAY,
            detail=result.get("message", "Failed to create draft task in Core API"),
        )
    return WebhookResponse(**result)


@app.post("/ai/improve", response_model=ImproveResponse)
async def ai_improve(req: ImproveRequest):
    parsed = await llm_client.parse_task(req.text)
    return ImproveResponse(
        title=parsed.title,
        description=parsed.description or "",
        urgency=parsed.urgency,
    )
