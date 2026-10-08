"""HTTP client for the bounded Automate worker API."""
from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class WorkerTransportError(RuntimeError):
    """Raised when the worker API cannot be reached or rejects a request."""


def _request_json(
    url: str,
    *,
    token: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    timeout: float = 30.0,
) -> dict[str, Any]:
    payload = None
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if body is not None:
        payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=payload, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise WorkerTransportError(f"worker request failed: {exc}") from exc
    try:
        result = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise WorkerTransportError("worker returned invalid JSON") from exc
    if not isinstance(result, dict):
        raise WorkerTransportError("worker returned a non-object JSON response")
    return result


def worker_base_url(url: str | None = None) -> str:
    value = (url or os.getenv("AUTOMATE_WORKER_URL") or "").strip().rstrip("/")
    if not value:
        raise WorkerTransportError("AUTOMATE_WORKER_URL is required")
    return value


def worker_token(token: str | None = None) -> str:
    value = (token or os.getenv("AUTOMATE_WORKER_TOKEN") or "").strip()
    if not value:
        raise WorkerTransportError("AUTOMATE_WORKER_TOKEN is required")
    return value


def worker_api_url(url: str | None = None) -> str:
    """Normalize a Chanfana deployment URL to its /worker/v1 API surface."""
    base = worker_base_url(url)
    suffix = "/worker/v1"
    if base.endswith(suffix):
        return base
    return base + suffix


def submit_worker_packet(packet: dict[str, Any], *, url: str | None = None,
                         token: str | None = None, timeout: float = 30.0) -> dict[str, Any]:
    return _request_json(worker_api_url(url) + "/jobs", token=worker_token(token),
                         method="POST", body=packet, timeout=timeout)


def start_worker_job(job_id: str, *, url: str | None = None,
                     token: str | None = None, timeout: float = 120.0) -> dict[str, Any]:
    return _request_json(worker_api_url(url) + f"/jobs/{job_id}/execute",
                         token=worker_token(token), timeout=timeout)


def read_worker_job(job_id: str, *, url: str | None = None,
                    token: str | None = None, include_result: bool = True,
                    timeout: float = 30.0) -> dict[str, Any]:
    query = "?includeResult=true" if include_result else "?includeResult=false"
    return _request_json(worker_api_url(url) + f"/jobs/{job_id}" + query,
                         token=worker_token(token), timeout=timeout)


def wait_worker_job(job_id: str, *, url: str | None = None,
                    token: str | None = None, poll_seconds: float = 2.0,
                    timeout: float = 1800.0) -> dict[str, Any]:
    import time
    deadline = time.monotonic() + timeout
    while True:
        job = read_worker_job(job_id, url=url, token=token, include_result=True)
        payload = job.get("job", {})
        if payload.get("state") in {"succeeded", "failed", "cancelled"}:
            return job
        if time.monotonic() >= deadline:
            raise WorkerTransportError(
                "worker wait timed out; job remains durable and can be polled later"
            )
        time.sleep(poll_seconds)


def dispatch_worker(packet: dict[str, Any], *, url: str | None = None,
                    token: str | None = None, execute: bool = False,
                    timeout: float = 30.0) -> dict[str, Any]:
    queued = submit_worker_packet(packet, url=url, token=token, timeout=timeout)
    if queued.get("success") is False:
        raise WorkerTransportError("worker rejected packet submission")
    if not execute:
        return {"queued": queued, "execution_requested": False}
    job_id = queued.get("jobId")
    if not isinstance(job_id, str) or not job_id:
        raise WorkerTransportError("worker did not return a jobId")

    state = str(queued.get("state") or "").lower()
    if state in {"running", "succeeded", "failed", "cancelled", "dead"}:
        return {
            "queued": queued,
            "execution_requested": False,
            "deduplicated": True,
            "terminal_or_active_state": state,
        }

    execution = start_worker_job(job_id, url=url, token=token, timeout=timeout)
    if execution.get("success") is False:
        raise WorkerTransportError("worker execution could not be started")
    return {"queued": queued, "execution_requested": True, "execution": execution}
