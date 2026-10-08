"""Bounded Automate -> Mirror verification-experiment client."""

from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from typing import Any, Mapping


class MirrorVerificationError(RuntimeError):
    pass


def verification_url(url: str | None = None) -> str:
    value = (url or os.getenv("MIRROR_VERIFICATION_EXPERIMENT_ENDPOINT") or "").strip()
    if not value:
        raise MirrorVerificationError("MIRROR_VERIFICATION_EXPERIMENT_ENDPOINT is required")
    return value.rstrip("/")


def verification_token(token: str | None = None) -> str:
    value = (token or os.getenv("MIRROR_VERIFICATION_JOB_TOKEN") or "").strip()
    if not value:
        raise MirrorVerificationError("MIRROR_VERIFICATION_JOB_TOKEN is required")
    return value


def run_mirror_verification(
    request: Mapping[str, Any],
    *,
    url: str | None = None,
    token: str | None = None,
    timeout: float = 125.0,
) -> dict[str, Any]:
    if request.get("schema_version") != "mirror.verification_request.v1":
        raise MirrorVerificationError("invalid Mirror verification request schema")
    request_id = str(request.get("request_id") or "")
    source_revision = str(request.get("source_revision") or "")
    if not request_id or not source_revision:
        raise MirrorVerificationError("Mirror verification request is missing identity binding")

    payload = json.dumps(dict(request), separators=(",", ":")).encode("utf-8")
    req = Request(
        verification_url(url),
        data=payload,
        headers={
            "Authorization": "Bearer " + verification_token(token),
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=min(max(float(timeout), 1.0), 130.0)) as response:
            raw = response.read(1_500_001).decode("utf-8")
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise MirrorVerificationError(f"Mirror verification request failed: {exc}") from exc
    if len(raw.encode("utf-8")) > 1_500_000:
        raise MirrorVerificationError("Mirror verification response exceeded the 1.5MB bound")
    try:
        result = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise MirrorVerificationError("Mirror verification returned invalid JSON") from exc
    if not isinstance(result, dict):
        raise MirrorVerificationError("Mirror verification returned a non-object response")
    if result.get("authority") != "UNTRUSTED_EXPERIMENTAL_OBSERVATION":
        raise MirrorVerificationError("Mirror verification returned an unexpected authority")
    if result.get("request_id") != request_id:
        raise MirrorVerificationError("Mirror verification result request_id mismatch")
    if result.get("source_revision") != source_revision:
        raise MirrorVerificationError("Mirror verification result source_revision mismatch")
    return result
