"""Vendor-neutral HTTP reasoning provider for the persistent Mirror worker.

The worker has no dependency on Ollama, Qwen, or a vendor SDK. The configured
endpoint receives a small JSON contract and may return OpenAI-compatible
choices/tool_calls or the normalized Mirror response directly.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from typing import Any, Mapping


class AIProviderError(RuntimeError):
    """Raised when the configured reasoning provider cannot complete a request."""


@dataclass(frozen=True)
class AIResponse:
    content: str
    tool_calls: tuple[dict[str, Any], ...] = ()
    model: str = "mirror-frontier"
    provider: str = "remote-http"


def _endpoint() -> str:
    value = os.getenv("MIRROR_AI_ENDPOINT", "").strip()
    if not value:
        raise AIProviderError("MIRROR_AI_ENDPOINT is not configured")
    return value


def _token() -> str:
    return os.getenv("MIRROR_AI_TOKEN", "").strip()


def _model() -> str:
    return os.getenv("MIRROR_AI_MODEL", "mirror-frontier").strip() or "mirror-frontier"


def _headers() -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "the-mirror-lab/0.2",
    }
    token = _token()
    if token:
        headers["Authorization"] = "Bearer " + token
    return headers


def _normalize_tool_call(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, Mapping):
        return None
    function = item.get("function")
    if isinstance(function, Mapping):
        name = function.get("name") or item.get("name")
        arguments = function.get("arguments")
    else:
        name = item.get("name")
        arguments = item.get("arguments")
    if not isinstance(name, str) or not name.strip():
        return None
    if isinstance(arguments, Mapping):
        parsed = dict(arguments)
    else:
        try:
            parsed = json.loads(str(arguments or "{}"))
        except json.JSONDecodeError:
            parsed = {}
    if not isinstance(parsed, dict):
        parsed = {}
    return {
        "id": str(item.get("id") or "tool-call"),
        "name": name.strip(),
        "arguments": parsed,
    }


def _normalize(payload: Any) -> AIResponse:
    if not isinstance(payload, Mapping):
        raise AIProviderError("reasoning provider returned a non-object JSON response")

    message = payload.get("message")
    if not isinstance(message, Mapping):
        choices = payload.get("choices")
        if isinstance(choices, list) and choices and isinstance(choices[0], Mapping):
            message = choices[0].get("message")
    if not isinstance(message, Mapping):
        message = payload

    content = message.get("content")
    if isinstance(content, list):
        pieces = [part.get("text") for part in content if isinstance(part, Mapping) and isinstance(part.get("text"), str)]
        content = "".join(pieces)
    content = str(content or "")

    raw_calls = message.get("tool_calls")
    if raw_calls is None:
        raw_calls = message.get("toolCalls")
    calls: list[dict[str, Any]] = []
    if isinstance(raw_calls, list):
        for item in raw_calls:
            call = _normalize_tool_call(item)
            if call is not None:
                calls.append(call)

    model = str(payload.get("model") or message.get("model") or _model())
    return AIResponse(
        content=content,
        tool_calls=tuple(calls),
        model=model,
    )


def complete(messages: list[dict[str, Any]], tools: list[dict[str, Any]], *, timeout_seconds: int = 120) -> AIResponse:
    endpoint = _endpoint()
    if not 1 <= timeout_seconds <= 300:
        raise ValueError("timeout_seconds must be between 1 and 300")
    payload = {
        "schema_version": "mirror.ai_completion.v1",
        "model": _model(),
        "messages": messages,
        "tools": tools,
        "options": {"temperature": 0, "stream": False},
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = Request(endpoint, data=body, headers=_headers(), method="POST")
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read(2_100_000)
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise AIProviderError(f"reasoning provider request failed: {exc}") from exc
    if len(raw) > 2_000_000:
        raise AIProviderError("reasoning provider response exceeded bounded size")
    try:
        parsed = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AIProviderError("reasoning provider returned invalid JSON") from exc
    result = _normalize(parsed)
    if not result.content and not result.tool_calls:
        raise AIProviderError("reasoning provider returned neither content nor tool calls")
    return result
