"""Persistent, append-only mission memory for the Mirror AI."""
from __future__ import annotations
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from pathlib import Path

@dataclass(frozen=True)
class MemoryRecord:
    kind: str
    content: str
    source: str
    timestamp: str

class MissionMemory:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
    def append(self, kind: str, content: str, source: str = "mirror") -> MemoryRecord:
        record=MemoryRecord(kind,content,source,datetime.now(timezone.utc).isoformat())
        self.path.parent.mkdir(parents=True,exist_ok=True)
        with self.path.open("a",encoding="utf-8") as f: f.write(json.dumps(asdict(record),ensure_ascii=False)+"\n")
        return record
    def recent(self, limit: int = 20) -> list[MemoryRecord]:
        if not self.path.exists(): return []
        return [MemoryRecord(**json.loads(x)) for x in self.path.read_text(encoding="utf-8").splitlines()[-limit:] if x.strip()]
    def context(self, limit: int = 20) -> str:
        return "\n".join(f"[{r.kind}] {r.content}" for r in self.recent(limit))
