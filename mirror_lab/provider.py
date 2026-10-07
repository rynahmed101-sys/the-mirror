"""Provider-neutral AI intelligence adapter using an OpenAI-compatible endpoint."""
from __future__ import annotations

import json
import os
import urllib.request
from typing import Any


class OpenAICompatibleProvider:
    """Small adapter for providers exposing /chat/completions-style JSON APIs.

    The provider returns one JSON decision object. Scientific authority stays outside
    the model and is enforced by FrontierOperator and Automate.
    """

    def __init__(self, endpoint: str | None = None, api_key: str | None = None, model: str | None = None) -> None:
        self.endpoint = endpoint or os.getenv("MIRROR_AI_ENDPOINT", "")
        self.api_key = api_key or os.getenv("MIRROR_AI_API_KEY", "")
        self.model = model or os.getenv("MIRROR_AI_MODEL", "")
        if not self.endpoint or not self.model:
            raise ValueError("MIRROR_AI_ENDPOINT and MIRROR_AI_MODEL are required")

    def decide(self, system_prompt: str, context: dict[str, Any]) -> dict[str, Any]:
        body = {
            "model": self.model,
            "temperature": 0,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": json.dumps(context, sort_keys=True, default=str),
                },
            ],
            "response_format": {"type": "json_object"},
        }
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = "Bearer " + self.api_key
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(body).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read(1_000_000))
        content = payload["choices"][0]["message"]["content"]
        decision = json.loads(content)
        if not isinstance(decision, dict):
            raise ValueError("AI provider did not return a JSON object")
        return decision
