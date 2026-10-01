"""Object storage for task attachments.

Files live in an S3-compatible backing service (RustFS in docker compose, AWS S3 /
Yandex Object Storage in the cloud), so a core-api replica keeps nothing on its local disk and can be killed
or moved at any moment. Which storage is used is decided by the CORE_S3_* settings
only — the code is the same for every S3-compatible service.
"""

from __future__ import annotations

from typing import Protocol

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from starlette.concurrency import run_in_threadpool

from app.config import settings


class ObjectNotFoundError(Exception):
    pass


class ObjectStorage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...

    async def get(self, key: str) -> bytes: ...

    async def delete(self, key: str) -> None: ...


class S3Storage:
    def __init__(self, bucket: str, **client_kwargs):
        self._bucket = bucket
        self._client = boto3.client("s3", config=Config(signature_version="s3v4"), **client_kwargs)

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await run_in_threadpool(
            self._client.put_object, Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
        )

    async def get(self, key: str) -> bytes:
        try:
            obj = await run_in_threadpool(self._client.get_object, Bucket=self._bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                raise ObjectNotFoundError(key) from exc
            raise
        return await run_in_threadpool(obj["Body"].read)

    async def delete(self, key: str) -> None:
        await run_in_threadpool(self._client.delete_object, Bucket=self._bucket, Key=key)

    def ensure_bucket(self, region: str) -> None:
        """Create the bucket if it is missing. Called by the one-off `migrate` admin process."""
        try:
            self._client.head_bucket(Bucket=self._bucket)
            return
        except ClientError as exc:
            # Anything but "not found" (e.g. 403 — wrong credentials) is a real error
            if exc.response.get("Error", {}).get("Code") not in {"404", "NoSuchBucket", "NotFound"}:
                raise
        kwargs = {}
        if region and region != "us-east-1":
            kwargs["CreateBucketConfiguration"] = {"LocationConstraint": region}
        self._client.create_bucket(Bucket=self._bucket, **kwargs)


_storage: S3Storage | None = None


def build_s3_storage() -> S3Storage:
    return S3Storage(
        settings.s3_bucket,
        endpoint_url=settings.s3_endpoint_url or None,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
    )


def get_storage() -> ObjectStorage:
    global _storage
    if _storage is None:
        _storage = build_s3_storage()
    return _storage
