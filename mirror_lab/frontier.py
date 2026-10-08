"""Bounded Chanfana transport for Mirror frontier missions.

This client only transports work. It never interprets a returned result as
truth and never exposes a remote Git or canonical-ledger mutation capability.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Mapping

from .reasoning import SpecialistName
from .tooling import ToolContext, ToolSpec
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class FrontierTransportError(RuntimeError):
    """Raised when the bounded frontier transport cannot complete safely."""


@dataclass(frozen=True)
class FrontierMission:
    repair_required: bool = False
    current_backlog: tuple[str, ...] = ()
    ledger_frontier: tuple[str, ...] = ()
    automate_requests: tuple[str, ...] = ()
    discovery_allowed: bool = False
    ledger_hash: str | None = None
    required_action: str | None = None


@dataclass(frozen=True)
class FrontierLimits:
    max_tool_steps: int = 8
    deadline_ms: int = 300_000
    max_response_bytes: int = 1_500_000

    def __post_init__(self) -> None:
        if not 1 <= self.max_tool_steps <= 32:
            raise ValueError("max_tool_steps must be between 1 and 32")
        if not 1_000 <= self.deadline_ms <= 900_000:
            raise ValueError("deadline_ms must be between 1000 and 900000")
        if not 65_536 <= self.max_response_bytes <= 2_000_000:
            raise ValueError("max_response_bytes is outside the contract bound")


@dataclass(frozen=True)
class FrontierPermissions:
    network: bool = True
    workspace_write: bool = True
    local_execution: bool = True
    git_commit: bool = True
    remote_git_mutation: bool = False
    canonical_mutation: bool = False

    def __post_init__(self) -> None:
        if self.remote_git_mutation or self.canonical_mutation:
            raise ValueError("Mirror frontier transport forbids remote Git and canonical mutation")


@dataclass(frozen=True)
class FrontierRequest:
    request_id: str
    action_cycle_id: str
    capability_id: str
    capability_name: str
    task: str
    base_revision: str
    mirror_endpoint: str
    mission: FrontierMission = field(default_factory=FrontierMission)
    limits: FrontierLimits = field(default_factory=FrontierLimits)
    permissions: FrontierPermissions = field(default_factory=FrontierPermissions)
    correlation_id: str = "mirror-frontier"
    parent_ids: tuple[str, ...] = ()

    def to_payload(self) -> dict[str, Any]:
        return {
            "schema_version": "mirror.frontier_job.v1",
            "request_id": self.request_id,
            "action_cycle_id": self.action_cycle_id,
            "execution_kind": "mirror_frontier",
            "target": {"mirror_endpoint": self.mirror_endpoint},
            "capability": {
                "id": self.capability_id,
                "name": self.capability_name,
                "task": self.task,
                "base_revision": self.base_revision,
            },
            "mission": asdict(self.mission),
            "limits": asdict(self.limits),
            "permissions": asdict(self.permissions),
            "provenance": {
                "correlation_id": self.correlation_id,
                "parent_ids": list(self.parent_ids),
            },
        }


class ChanfanaFrontierClient:
    """Thin bounded client for Chanfana's worker/v1/jobs transport."""

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        *,
        opener: Callable[..., Any] | None = None,
    ) -> None:
        base = (base_url or os.getenv("MIRROR_FRONTIER_TRANSPORT_URL") or "").strip().rstrip("/")
        if not base:
            raise FrontierTransportError("MIRROR_FRONTIER_TRANSPORT_URL is required")
        self.base_url = base if base.endswith("/worker/v1") else base + "/worker/v1"
        self.token = (token or os.getenv("MIRROR_FRONTIER_JOB_TOKEN") or "").strip()
        if not self.token:
            raise FrontierTransportError("MIRROR_FRONTIER_JOB_TOKEN is required")
        self._open = opener or urlopen

    def _request(
        self,
        path: str,
        *,
        method: str = "GET",
        payload: Mapping[str, Any] | None = None,
        timeout: float = 30.0,
    ) -> dict[str, Any]:
        body = None
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        if payload is not None:
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = Request(self.base_url + path, headers=headers, data=body, method=method)
        try:
            with self._open(request, timeout=timeout) as response:
                raw = response.read()
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            raise FrontierTransportError(f"frontier transport failed: {exc}") from exc
        try:
            result = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise FrontierTransportError("frontier transport returned invalid JSON") from exc
        if not isinstance(result, dict):
            raise FrontierTransportError("frontier transport returned a non-object response")
        return result

    def submit(self, request: FrontierRequest) -> dict[str, Any]:
        response = self._request("/jobs", method="POST", payload=request.to_payload())
        if response.get("success") is False:
            raise FrontierTransportError("Chanfana rejected the frontier request")
        if response.get("requestId") != request.request_id:
            raise FrontierTransportError("Chanfana returned a mismatched requestId")
        job_id = response.get("jobId")
        if not isinstance(job_id, str) or not job_id:
            raise FrontierTransportError("Chanfana returned no durable jobId")
        return response

    def read(self, job_id: str) -> dict[str, Any]:
        if not job_id.strip():
            raise ValueError("job_id is required")
        return self._request(f"/jobs/{job_id}?includeResult=true")

    def wait(self, job_id: str, *, timeout_seconds: float = 1800.0, poll_seconds: float = 2.0) -> dict[str, Any]:
        if timeout_seconds <= 0 or poll_seconds <= 0:
            raise ValueError("wait budgets must be positive")
        deadline = time.monotonic() + timeout_seconds
        while True:
            response = self.read(job_id)
            state = str(response.get("job", {}).get("state") or "").lower()
            if state in {"succeeded", "failed", "cancelled", "dead"}:
                return response
            if time.monotonic() >= deadline:
                raise FrontierTransportError("frontier wait timed out; durable job remains pollable")
            time.sleep(poll_seconds)

    @staticmethod
    def classify_result(response: Mapping[str, Any]) -> dict[str, Any]:
        """Wrap worker output as untrusted evidence."""
        job = response.get("job", {})
        return {
            "authority": "UNTRUSTED_TRANSPORT_RESULT",
            "state": job.get("state"),
            "result": job.get("result"),
            "source": "chanfana",
            "request_id": job.get("request_id"),
            "job_id": job.get("id"),
        }


def frontier_tool_spec(client: ChanfanaFrontierClient) -> ToolSpec:
    """Expose frontier submission through the single Mirror ToolRegistry."""
    def handle(value: Any, context: ToolContext) -> dict[str, Any]:
        if not isinstance(value, FrontierRequest):
            raise TypeError("frontier tool input must be a FrontierRequest")
        if context.source_revision and value.base_revision != context.source_revision:
            raise FrontierTransportError(
                "frontier request base_revision does not match tool source_revision"
            )
        queued = client.submit(value)
        return {
            "authority": "UNTRUSTED_TRANSPORT_ACK",
            "queued": queued,
            "mission_id": context.mission_id,
            "cycle_id": context.cycle_id,
        }

    return ToolSpec(
        name="automate.frontier.submit",
        specialist=SpecialistName.REASONING,
        handler=handle,
        description="Queue a bounded Mirror frontier mission through Chanfana.",
        timeout_seconds=30.0,
        authorization_required=True,
        mutating=True,
    )
