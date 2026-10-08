"""Read-only Automate frontier adapter.

Mirror may inspect Automate's canonical ledger and capability inventory as
external evidence. It never writes to Automate and never promotes a claim.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class AutomateFrontierError(RuntimeError):
    pass


@dataclass(frozen=True)
class AutomateFrontierSnapshot:
    repository: str
    revision: str
    ledger: str
    inventory: dict[str, Any] | None
    ledger_sha256: str
    inventory_sha256: str | None

    @property
    def authority(self) -> str:
        return "AUTOMATE_CANONICAL_READ_ONLY"


def _read_json_url(url: str, token: str | None = None) -> Any:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "the-mirror-lab/0.1"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=20) as response:
            return json.loads(response.read(3_000_000))
    except (HTTPError, URLError, OSError, TimeoutError) as exc:
        raise AutomateFrontierError(f"Automate read failed: {exc}") from exc


def _read_text_url(url: str, token: str | None = None) -> str:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "the-mirror-lab/0.1"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=20) as response:
            data = response.read(3_000_000)
    except (HTTPError, URLError, OSError, TimeoutError) as exc:
        raise AutomateFrontierError(f"Automate read failed: {exc}") from exc
    return data.decode("utf-8", "replace")


def _resolve_revision(
    repository: str,
    revision: str,
    token: str | None = None,
) -> str:
    if len(revision) == 40 and all(ch in "0123456789abcdefABCDEF" for ch in revision):
        return revision.lower()
    payload = _read_json_url(
        f"https://api.github.com/repos/{repository}/git/ref/heads/{revision}",
        token,
    )
    sha = str(payload.get("object", {}).get("sha") or "")
    if len(sha) != 40:
        raise AutomateFrontierError("Automate revision did not resolve to a full commit SHA")
    return sha.lower()


def _read_optional_text_url(url: str, token: str | None = None) -> str | None:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "the-mirror-lab/0.1"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=20) as response:
            data = response.read(3_000_001)
    except HTTPError as exc:
        if exc.code == 404:
            return None
        raise AutomateFrontierError(f"Automate optional read failed: HTTP {exc.code}") from exc
    except (URLError, OSError, TimeoutError) as exc:
        raise AutomateFrontierError(f"Automate optional read failed: {exc}") from exc
    return data.decode("utf-8", "replace")


def read_automate_frontier(
    *,
    repository: str = "rynahmed101-sys/automate",
    revision: str = "main",
    token: str | None = None,
) -> AutomateFrontierSnapshot:
    token = token or os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
    resolved_revision = _resolve_revision(repository, revision, token)
    base = f"https://raw.githubusercontent.com/{repository}/{resolved_revision}"
    ledger = _read_text_url(f"{base}/docs/PROJECT_PHASE_LEDGER.md", token)
    inventory_raw = _read_optional_text_url(f"{base}/docs/CAPABILITY_INVENTORY.json", token)
    inventory = None
    inventory_sha = None
    if inventory_raw is not None:
        inventory_sha = hashlib.sha256(inventory_raw.encode("utf-8")).hexdigest()
        try:
            parsed = json.loads(inventory_raw)
            inventory = parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            inventory = None
    return AutomateFrontierSnapshot(
        repository=repository,
        revision=resolved_revision,
        ledger=ledger,
        inventory=inventory,
        ledger_sha256=hashlib.sha256(ledger.encode("utf-8")).hexdigest(),
        inventory_sha256=inventory_sha,
    )
