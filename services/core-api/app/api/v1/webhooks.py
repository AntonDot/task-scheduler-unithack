"""External webhook ingress for automations.

Each automation with an external trigger type (github_event / webhook_generic /
review_received) gets a `webhook_token` that maps to a public URL at
`/api/v1/webhooks/{token}`. Hits to that URL are:

  1. authenticated by token-in-path (and optional HMAC for github)
  2. deduped via the `webhook_deliveries` table
  3. normalized into a canonical event payload
  4. published to RabbitMQ on the same `automation.events` queue used by
     internal triggers — the automation-worker handles them identically.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Automation, WebhookDelivery
from app.rabbitmq import rabbitmq_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])


def _map_github_event(event: str, action: str, body: dict) -> str | None:
    """Map raw GitHub headers + body to a canonical event_type, or None to ignore."""
    if event == "pull_request":
        pr = body.get("pull_request") or {}
        if action == "closed" and pr.get("merged"):
            return "github_pr_merged"
        if action == "closed":
            return "github_pr_closed"
        if action == "opened":
            return "github_pr_opened"
        if action == "reopened":
            return "github_pr_reopened"
        return None
    if event == "issues":
        if action == "opened":
            return "github_issue_opened"
        if action == "closed":
            return "github_issue_closed"
        return None
    if event == "push":
        return "github_push"
    if event == "ping":
        return "github_ping"
    return None


def _normalize_github(canonical: str, body: dict) -> dict[str, Any]:
    """Extract a flat, template-friendly shape from GitHub's verbose payloads."""
    repo = body.get("repository") or {}
    sender = body.get("sender") or {}
    out: dict[str, Any] = {
        "repo": {
            "full_name": repo.get("full_name"),
            "name": repo.get("name"),
            "html_url": repo.get("html_url"),
        },
        "sender": {
            "login": sender.get("login"),
        },
    }
    if canonical.startswith("github_pr_"):
        pr = body.get("pull_request") or {}
        out["pr"] = {
            "number": pr.get("number"),
            "title": pr.get("title"),
            "url": pr.get("html_url"),
            "author": (pr.get("user") or {}).get("login"),
            "merged_by": (pr.get("merged_by") or {}).get("login"),
            "base_branch": (pr.get("base") or {}).get("ref"),
            "head_branch": (pr.get("head") or {}).get("ref"),
            "merged": pr.get("merged"),
            "body": pr.get("body"),
        }
    elif canonical.startswith("github_issue_"):
        issue = body.get("issue") or {}
        out["issue"] = {
            "number": issue.get("number"),
            "title": issue.get("title"),
            "body": issue.get("body"),
            "html_url": issue.get("html_url"),
            "author": (issue.get("user") or {}).get("login"),
        }
    elif canonical == "github_push":
        out["ref"] = body.get("ref")
        out["pusher"] = (body.get("pusher") or {}).get("name")
        out["commits"] = [
            {"id": c.get("id"), "message": c.get("message"), "url": c.get("url")}
            for c in (body.get("commits") or [])
        ]
    return out


@router.post("/api/v1/webhooks/{token}")
async def receive_webhook(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Generic webhook receiver — routes by stored automation.trigger.type."""
    raw_body = await request.body()
    try:
        body_json: dict = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Body must be valid JSON")

    result = await db.execute(select(Automation).where(Automation.webhook_token == token))
    automation = result.scalar_one_or_none()
    if not automation:
        raise HTTPException(status_code=404, detail="Unknown webhook token")
    if not automation.is_active:
        raise HTTPException(status_code=410, detail="Automation disabled")

    trigger_cfg = (automation.config or {}).get("trigger") or {}
    trigger_type = trigger_cfg.get("type", "webhook_generic")
    params = trigger_cfg.get("params") or {}

    # Resolve event_type, external_event_id, normalized_payload
    if trigger_type == "github_event":
        secret = params.get("secret")
        if secret:
            sig_header = request.headers.get("x-hub-signature-256", "")
            expected = "sha256=" + hmac.new(
                secret.encode("utf-8"), raw_body, hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(sig_header, expected):
                raise HTTPException(status_code=401, detail="Invalid HMAC signature")

        gh_event = request.headers.get("x-github-event", "")
        action = body_json.get("action", "")
        canonical = _map_github_event(gh_event, action, body_json)
        if not canonical:
            # Ignored but ack — GitHub retries on non-2xx
            return JSONResponse(status_code=200, content={"status": "ignored", "event": gh_event, "action": action})
        if canonical == "github_ping":
            return JSONResponse(status_code=200, content={"status": "pong"})

        event_type = canonical
        external_event_id = (
            request.headers.get("x-github-delivery")
            or hashlib.sha256(raw_body).hexdigest()
        )
        normalized = _normalize_github(canonical, body_json)

    elif trigger_type == "webhook_generic":
        # Always use "webhook_generic" as event_type so the worker's
        # trigger.type == event_type check matches the stored config.
        # The custom event_type from the body goes into the payload
        # so conditions/templates can still reference it.
        event_type = "webhook_generic"
        custom_event_type = body_json.get("event_type", "webhook_generic")
        external_event_id = (
            body_json.get("external_event_id")
            or hashlib.sha256(raw_body).hexdigest()
        )
        # Use either body.payload (if structured) or the whole body
        normalized = body_json.get("payload", body_json)
        if not isinstance(normalized, dict):
            normalized = {"value": normalized}
        # Inject the custom event_type into payload for templates/conditions
        normalized = dict(normalized)
        normalized["webhook_event_type"] = custom_event_type

    elif trigger_type == "review_received":
        # Allow scrapers / external systems to push reviews directly
        event_type = "review_received"
        review = body_json.get("review") or body_json
        external_event_id = (
            body_json.get("external_event_id")
            or (f"review:{review.get('id')}" if isinstance(review, dict) and review.get("id") else None)
            or hashlib.sha256(raw_body).hexdigest()
        )
        normalized = {"review": review} if isinstance(review, dict) else {}

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Trigger type '{trigger_type}' does not support webhook ingress",
        )

    # is_duplicate_prohibited=true → bypass dedupe, always process even if seen before.
    # Useful for repeated manual triggers or idempotency-not-required integrations.
    # Default (false / absent) → dedupe is active via webhook_deliveries table.
    allow_duplicates = bool(body_json.get("is_duplicate_prohibited", False))

    if not allow_duplicates:
        # Dedupe via UNIQUE(automation_id, external_event_id)
        try:
            db.add(WebhookDelivery(
                automation_id=automation.id,
                external_event_id=str(external_event_id),
            ))
            await db.commit()
        except IntegrityError:
            await db.rollback()
            return JSONResponse(status_code=200, content={"status": "duplicate"})

    # Enrich payload with context the worker needs to act
    normalized = dict(normalized)
    normalized["project_id"] = automation.project_id
    normalized["automation_id"] = str(automation.id)
    normalized["external_event_id"] = str(external_event_id)

    await rabbitmq_manager.publish_event(event_type, normalized)
    logger.info(
        "Webhook accepted: token=%s automation=%s event=%s dedupe=%s",
        token[:8], automation.id, event_type, not allow_duplicates,
    )

    return JSONResponse(
        status_code=202,
        content={"status": "accepted", "event_type": event_type, "dedup": not allow_duplicates},
    )
