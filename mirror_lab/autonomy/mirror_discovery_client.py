"""Bounded Automate -> Mirror discovery client."""

from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from typing import Any, Mapping


class MirrorDiscoveryError(RuntimeError):
    pass


def mirror_discovery_url(url: str | None = None) -> str:
    value = (url or os.getenv("MIRROR_AUTONOMOUS_DISCOVERY_ENDPOINT") or "").strip().rstrip("/")
    if not value:
        raise MirrorDiscoveryError("MIRROR_AUTONOMOUS_DISCOVERY_ENDPOINT is required")
    return value


def mirror_discovery_token(token: str | None = None) -> str:
    value = (token or os.getenv("MIRROR_AUTONOMOUS_DISCOVERY_TOKEN") or "").strip()
    if not value:
        raise MirrorDiscoveryError("MIRROR_AUTONOMOUS_DISCOVERY_TOKEN is required")
    return value


def dispatch_mirror_discovery(
    grant: Mapping[str, Any],
    *,
    url: str | None = None,
    token: str | None = None,
    objective: str | None = None,
    max_tool_steps: int = 6,
    timeout: float = 30.0,
) -> dict[str, Any]:
    if grant.get("schema_version") != "automate.mirror_discovery_grant.v1":
        raise MirrorDiscoveryError("invalid discovery grant schema")
    if grant.get("canonical_mutation_allowed") is not False:
        raise MirrorDiscoveryError("discovery grant cannot permit canonical mutation")
    max_tool_steps = min(max(1, int(max_tool_steps)), 8)
    body = {
        "correlationId": str(grant.get("correlation_id") or ""),
        "discoveryGrant": dict(grant),
        "objective": (
            objective
            or "Investigate one promising mathematical or physical idea, challenge it with evidence, "
            "and propose at most one new capability candidate when justified."
        ),
        "maxToolSteps": max_tool_steps,
    }
    request = Request(
        mirror_discovery_url(url),
        data=json.dumps(body, separators=(",", ":")).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + mirror_discovery_token(token),
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read(1_500_001).decode("utf-8")
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise MirrorDiscoveryError(f"Mirror discovery request failed: {exc}") from exc
    if len(raw.encode("utf-8")) > 1_500_000:
        raise MirrorDiscoveryError("Mirror discovery response exceeded the 1.5MB bound")
    try:
        payload = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise MirrorDiscoveryError("Mirror discovery returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise MirrorDiscoveryError("Mirror discovery returned a non-object response")
    return payload
