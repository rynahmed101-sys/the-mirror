"""Provider-neutral structured-data research contracts.

The provider is deliberately replaceable: SQL engines, BigQuery-like services,
DuckDB/local files, and scientific repositories can implement the same bounded
query -> records -> provenance contract. Providers are evidence sources, never
authority.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Protocol, Sequence

from jsonschema import Draft202012Validator

from automate.dev.worker import ROOT

QUERY_SCHEMA_PATH = ROOT / "schemas" / "automate-data-query-v1.json"
EVIDENCE_SCHEMA_PATH = ROOT / "schemas" / "automate-data-evidence-v1.json"


class DataProvider(Protocol):
    name: str

    def execute(self, request: dict[str, Any]) -> dict[str, Any]:
        """Execute one bounded query and return a raw evidence packet."""


def _validate(path: Path, payload: dict[str, Any]) -> list[str]:
    schema = json.loads(path.read_text(encoding="utf-8"))
    return [error.message for error in Draft202012Validator(schema).iter_errors(payload)]


def validate_query(request: dict[str, Any]) -> list[str]:
    return _validate(QUERY_SCHEMA_PATH, request)


def validate_evidence(packet: dict[str, Any]) -> list[str]:
    return _validate(EVIDENCE_SCHEMA_PATH, packet)


def build_query(
    *,
    request_id: str,
    provider: str,
    query: str,
    max_rows: int = 10_000,
    max_bytes: int = 5_000_000,
    timeout_ms: int = 60_000,
    sources: Sequence[str] | None = None,
    required_provenance: Sequence[str] | None = None,
) -> dict[str, Any]:
    request = {
        "schema_version": "automate.data_query.v1",
        "request_id": request_id,
        "provider": provider,
        "query": query,
        "sources": list(sources or []),
        "limits": {
            "max_rows": max_rows,
            "max_bytes": max_bytes,
            "timeout_ms": timeout_ms,
        },
        "required_provenance": list(required_provenance or []),
    }
    errors = validate_query(request)
    if errors:
        raise ValueError("; ".join(errors))
    return request


def content_sha256(value: str | bytes) -> str:
    raw = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(raw).hexdigest()


def accept_provider_evidence(
    request: dict[str, Any],
    raw_packet: dict[str, Any],
) -> dict[str, Any]:
    """Validate and bound provider output before it enters Automate evidence."""
    errors = validate_query(request)
    if errors:
        raise ValueError("invalid data query: " + "; ".join(errors))

    if raw_packet.get("request_id") != request["request_id"]:
        raise ValueError("provider evidence request_id does not match query")

    rows = raw_packet.get("rows")
    if not isinstance(rows, list):
        raise ValueError("provider evidence rows must be a list")
    max_rows = request["limits"]["max_rows"]
    if len(rows) > max_rows:
        raise ValueError("provider exceeded max_rows; evidence rejected")

    encoded = json.dumps(rows, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(encoded) > request["limits"]["max_bytes"]:
        raise ValueError("provider exceeded max_bytes; evidence rejected")

    packet = dict(raw_packet)
    packet.setdefault("schema_version", "automate.data_evidence.v1")
    packet.setdefault("provider", request["provider"])
    packet.setdefault("query", request["query"])
    packet.setdefault("stats", {"row_count": len(rows), "bytes": len(encoded)})

    evidence_errors = validate_evidence(packet)
    if evidence_errors:
        raise ValueError("invalid provider evidence: " + "; ".join(evidence_errors))
    return packet
