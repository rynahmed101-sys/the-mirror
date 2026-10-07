"""Evidence and provenance primitives for Mirror AI."""
from __future__ import annotations
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib, json
from pathlib import Path
from typing import Any

@dataclass(frozen=True)
class Evidence:
    kind: str
    source: str
    content: str
    sha256: str
    timestamp: str
    trusted: bool = False

    @classmethod
    def create(cls, kind: str, source: str, content: str, *, trusted: bool = False) -> "Evidence":
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        return cls(kind, source, content, digest, datetime.now(timezone.utc).isoformat(), trusted)

class EvidenceStore:
    """Append-only evidence ledger. It stores claims; it does not certify them."""
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def append(self, evidence: Evidence) -> Evidence:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(asdict(evidence), ensure_ascii=False) + "\n")
        return evidence

    def recent(self, limit: int = 50) -> list[Evidence]:
        if not self.path.exists():
            return []
        rows = [x for x in self.path.read_text(encoding="utf-8").splitlines() if x.strip()]
        return [Evidence(**json.loads(x)) for x in rows[-limit:]]
