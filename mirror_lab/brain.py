"""Deterministic cognitive substrate for Mirror AI.

Mirror Brain is deliberately independent of any language model.  It provides
persistent state, memory, goals, beliefs, procedures, self-audit, attention,
and bounded decision-making.  A future reasoning model may speak through it,
but the brain does not depend on a model, cloud service, API key, or token
quota.

The implementation is intentionally small and inspectable.  SQLite is the
durable store; retrieval uses deterministic lexical overlap plus recency and
goal relevance.  Scientific claims remain evidence, never certification.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import hashlib
import json
import re
import sqlite3
from pathlib import Path
from typing import Any, Callable, Iterable


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-zA-Z0-9_]{2,}", text.lower())
        if token not in {"the", "and", "for", "with", "from", "that", "this", "are"}
    }


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class MemoryKind(str, Enum):
    SENSORY = "sensory"
    WORKING = "working"
    EPISODIC = "episodic"
    SEMANTIC = "semantic"
    PROCEDURAL = "procedural"
    GOAL = "goal"
    BELIEF = "belief"
    SELF = "self"
    EVIDENCE = "evidence"
    RESEARCH = "research"
    PROJECT = "project"
    FAILURE = "failure"
    STRATEGY = "strategy"


@dataclass(frozen=True)
class Memory:
    id: int
    kind: str
    content: str
    source: str
    confidence: float
    created_at: str
    valid_from: str | None
    valid_to: str | None
    supersedes: int | None
    tombstoned: bool
    content_hash: str


@dataclass(frozen=True)
class Recall:
    memory: Memory
    score: float
    provenance: str


@dataclass(frozen=True)
class Goal:
    id: int
    text: str
    status: str
    priority: int
    created_at: str


@dataclass(frozen=True)
class Belief:
    id: int
    text: str
    confidence: float
    status: str
    evidence: str
    created_at: str


@dataclass(frozen=True)
class Procedure:
    id: int
    name: str
    steps: tuple[str, ...]
    success_count: int
    failure_count: int


@dataclass(frozen=True)
class Decision:
    action: str
    reason: str
    priority: int
    inputs: tuple[str, ...]


@dataclass
class MirrorBrain:
    path: Path
    _conn: sqlite3.Connection = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._init_schema()

    def close(self) -> None:
        self._conn.close()

    def _init_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                content TEXT NOT NULL,
                source TEXT NOT NULL,
                confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
                created_at TEXT NOT NULL,
                valid_from TEXT,
                valid_to TEXT,
                supersedes INTEGER REFERENCES memories(id),
                tombstoned INTEGER NOT NULL DEFAULT 0,
                content_hash TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);
            CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);

            CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                status TEXT NOT NULL,
                priority INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS beliefs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
                status TEXT NOT NULL,
                evidence TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS procedures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                steps_json TEXT NOT NULL,
                success_count INTEGER NOT NULL DEFAULT 0,
                failure_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                event_hash TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                started_at TEXT NOT NULL,
                status TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS working_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_working_session ON working_memory(session_id);
            """
        )
        self._conn.commit()

    def _event(self, event_type: str, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        self._conn.execute(
            "INSERT INTO events(event_type,payload_json,created_at,event_hash) VALUES(?,?,?,?)",
            (event_type, body, _now(), _hash(body)),
        )

    def observe(
        self,
        content: str,
        *,
        kind: MemoryKind = MemoryKind.EPISODIC,
        source: str = "mirror",
        confidence: float = 1.0,
        valid_from: str | None = None,
        valid_to: str | None = None,
    ) -> Memory:
        if not content.strip():
            raise ValueError("memory content must not be empty")
        if not 0 <= confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        cur = self._conn.execute(
            """INSERT INTO memories
               (kind,content,source,confidence,created_at,valid_from,valid_to,content_hash)
               VALUES(?,?,?,?,?,?,?,?)""",
            (kind.value, content, source, confidence, _now(), valid_from, valid_to, _hash(content)),
        )
        memory_id = int(cur.lastrowid)
        self._event("memory_observed", {"memory_id": memory_id, "kind": kind.value, "source": source})
        self._conn.commit()
        return self.memory(memory_id)

    def memory(self, memory_id: int) -> Memory:
        row = self._conn.execute("SELECT * FROM memories WHERE id=?", (memory_id,)).fetchone()
        if row is None:
            raise KeyError(memory_id)
        return Memory(
            id=row["id"], kind=row["kind"], content=row["content"], source=row["source"],
            confidence=row["confidence"], created_at=row["created_at"],
            valid_from=row["valid_from"], valid_to=row["valid_to"],
            supersedes=row["supersedes"], tombstoned=bool(row["tombstoned"]),
            content_hash=row["content_hash"],
        )

    def recall(self, cue: str, *, limit: int = 8, kinds: Iterable[MemoryKind] | None = None) -> list[Recall]:
        if not cue.strip() or limit <= 0:
            return []
        query = _tokens(cue)
        if not query:
            return []
        params: list[Any] = []
        sql = "SELECT * FROM memories WHERE tombstoned=0"
        if kinds:
            values = [k.value for k in kinds]
            sql += " AND kind IN (" + ",".join("?" for _ in values) + ")"
            params.extend(values)
        rows = self._conn.execute(sql, params).fetchall()
        active_goals = self._conn.execute(
            "SELECT text FROM goals WHERE status='active' ORDER BY priority DESC LIMIT 8"
        ).fetchall()
        goal_tokens = set().union(*(_tokens(r["text"]) for r in active_goals)) if active_goals else set()

        scored: list[Recall] = []
        for row in rows:
            content_tokens = _tokens(row["content"])
            overlap = len(query & content_tokens)
            if overlap == 0:
                continue
            score = overlap / max(1, len(query))
            if goal_tokens:
                score += 0.10 * (len(goal_tokens & content_tokens) / max(1, len(goal_tokens)))
            age_days = max(
                0.0,
                (datetime.now(timezone.utc) - datetime.fromisoformat(row["created_at"])).total_seconds()
                / 86400,
            )
            score += 0.05 / (1.0 + age_days)
            score *= 0.5 + 0.5 * row["confidence"]
            scored.append(
                Recall(
                    self.memory(row["id"]),
                    score,
                    f"memory:{row['id']} source:{row['source']} hash:{row['content_hash']}",
                )
            )
        scored.sort(key=lambda item: (-item.score, item.memory.id))
        return scored[:limit]

    def set_goal(self, text: str, *, priority: int = 0) -> Goal:
        if not text.strip():
            raise ValueError("goal text must not be empty")
        cur = self._conn.execute(
            "INSERT INTO goals(text,status,priority,created_at) VALUES(?,?,?,?)",
            (text, "active", priority, _now()),
        )
        goal_id = int(cur.lastrowid)
        self._event("goal_created", {"goal_id": goal_id})
        self._conn.commit()
        return self.goal(goal_id)

    def goal(self, goal_id: int) -> Goal:
        row = self._conn.execute("SELECT * FROM goals WHERE id=?", (goal_id,)).fetchone()
        if row is None:
            raise KeyError(goal_id)
        return Goal(row["id"], row["text"], row["status"], row["priority"], row["created_at"])

    def active_goals(self) -> list[Goal]:
        rows = self._conn.execute(
            "SELECT * FROM goals WHERE status='active' ORDER BY priority DESC, id"
        ).fetchall()
        return [Goal(r["id"], r["text"], r["status"], r["priority"], r["created_at"]) for r in rows]

    def set_goal_status(self, goal_id: int, status: str) -> Goal:
        if status not in {"active", "completed", "blocked", "abandoned"}:
            raise ValueError("invalid goal status")
        self._conn.execute("UPDATE goals SET status=? WHERE id=?", (status, goal_id))
        self._event("goal_status_changed", {"goal_id": goal_id, "status": status})
        self._conn.commit()
        return self.goal(goal_id)

    def assert_belief(
        self, text: str, *, confidence: float, evidence: str, status: str = "active"
    ) -> Belief:
        if not 0 <= confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        cur = self._conn.execute(
            "INSERT INTO beliefs(text,confidence,status,evidence,created_at) VALUES(?,?,?,?,?)",
            (text, confidence, status, evidence, _now()),
        )
        belief_id = int(cur.lastrowid)
        self._event("belief_asserted", {"belief_id": belief_id})
        self._conn.commit()
        return self.belief(belief_id)

    def belief(self, belief_id: int) -> Belief:
        row = self._conn.execute("SELECT * FROM beliefs WHERE id=?", (belief_id,)).fetchone()
        if row is None:
            raise KeyError(belief_id)
        return Belief(row["id"], row["text"], row["confidence"], row["status"], row["evidence"], row["created_at"])

    def revise_belief(
        self, belief_id: int, *, confidence: float, evidence: str, status: str = "active"
    ) -> Belief:
        if not 0 <= confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        self._conn.execute(
            "UPDATE beliefs SET confidence=?, evidence=?, status=? WHERE id=?",
            (confidence, evidence, status, belief_id),
        )
        self._event(
            "belief_revised",
            {"belief_id": belief_id, "confidence": confidence, "status": status},
        )
        self._conn.commit()
        return self.belief(belief_id)

    def add_procedure(self, name: str, steps: Iterable[str]) -> Procedure:
        materialized = tuple(step for step in steps if step.strip())
        if not name.strip() or not materialized:
            raise ValueError("procedure requires a name and at least one step")
        cur = self._conn.execute(
            "INSERT INTO procedures(name,steps_json) VALUES(?,?)",
            (name, json.dumps(materialized)),
        )
        procedure_id = int(cur.lastrowid)
        self._event("procedure_added", {"procedure_id": procedure_id})
        self._conn.commit()
        return self.procedure(procedure_id)

    def procedure(self, procedure_id: int) -> Procedure:
        row = self._conn.execute("SELECT * FROM procedures WHERE id=?", (procedure_id,)).fetchone()
        if row is None:
            raise KeyError(procedure_id)
        return Procedure(
            row["id"], row["name"], tuple(json.loads(row["steps_json"])),
            row["success_count"], row["failure_count"],
        )

    def record_procedure_result(self, procedure_id: int, *, success: bool) -> Procedure:
        field = "success_count" if success else "failure_count"
        self._conn.execute(
            f"UPDATE procedures SET {field}={field}+1 WHERE id=?", (procedure_id,)
        )
        self._event("procedure_result", {"procedure_id": procedure_id, "success": success})
        self._conn.commit()
        return self.procedure(procedure_id)

    def start_session(self, session_id: str) -> None:
        self._conn.execute(
            "INSERT OR REPLACE INTO sessions(session_id,started_at,status) VALUES(?,?,?)",
            (session_id, _now(), "active"),
        )
        self._event("session_started", {"session_id": session_id})
        self._conn.commit()

    def working_add(self, session_id: str, content: str) -> None:
        if not content.strip():
            raise ValueError("working memory content must not be empty")
        self._conn.execute(
            "INSERT INTO working_memory(session_id,content,created_at) VALUES(?,?,?)",
            (session_id, content, _now()),
        )
        self._event("working_memory_added", {"session_id": session_id})
        self._conn.commit()

    def working(self, session_id: str, *, limit: int = 20) -> list[str]:
        rows = self._conn.execute(
            "SELECT content FROM working_memory WHERE session_id=? ORDER BY id DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
        return [r["content"] for r in reversed(rows)]

    def consolidate(self) -> int:
        """Promote repeated, high-confidence observations into semantic memory."""
        rows = self._conn.execute(
            """SELECT content, AVG(confidence) AS confidence, COUNT(*) AS n
               FROM memories
               WHERE tombstoned=0 AND kind IN ('sensory','episodic')
               GROUP BY content
               HAVING COUNT(*) >= 2"""
        ).fetchall()
        promoted = 0
        for row in rows:
            existing = self._conn.execute(
                "SELECT id FROM memories WHERE kind='semantic' AND content_hash=? AND tombstoned=0",
                (_hash(row["content"]),),
            ).fetchone()
            if existing:
                continue
            self.observe(
                row["content"],
                kind=MemoryKind.SEMANTIC,
                source="consolidation",
                confidence=min(1.0, float(row["confidence"]) + 0.05),
            )
            promoted += 1
        self._event("consolidation_completed", {"promoted": promoted})
        self._conn.commit()
        return promoted

    def unlearn(self, memory_id: int, *, reason: str) -> None:
        if not reason.strip():
            raise ValueError("unlearn requires a reason")
        self.memory(memory_id)
        self._conn.execute("UPDATE memories SET tombstoned=1 WHERE id=?", (memory_id,))
        self._event("memory_unlearned", {"memory_id": memory_id, "reason": reason})
        self._conn.commit()

    def record_event(self, event_type: str, payload: dict[str, Any]) -> None:
        """Record a machine-readable append-only reasoning event."""
        if not event_type.strip():
            raise ValueError("event type must not be empty")
        self._event(event_type, payload)
        self._conn.commit()

    def self_audit(self, *, limit: int = 50) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT id,event_type,payload_json,created_at,event_hash FROM events ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "event_type": r["event_type"],
                "payload": json.loads(r["payload_json"]),
                "created_at": r["created_at"],
                "event_hash": r["event_hash"],
            }
            for r in reversed(rows)
        ]

    def decide(
        self,
        *,
        repair_required: bool,
        current_backlog: Iterable[str],
        ledger_frontier: str | None,
        automate_requests: Iterable[str],
        discovery_allowed: bool,
    ) -> Decision:
        backlog = tuple(x for x in current_backlog if x)
        requests = tuple(x for x in automate_requests if x)
        if repair_required:
            return Decision("repair", "repair has strict priority", 0, backlog)
        if backlog:
            return Decision("current_work", "current backlog precedes new discovery", 1, backlog)
        if ledger_frontier:
            return Decision("ledger_frontier", "work the earliest canonical frontier", 2, (ledger_frontier,))
        if requests:
            return Decision("automate_request", "Automate supplied an explicit bounded request", 3, requests)
        if discovery_allowed:
            return Decision("discovery", "discovery is allowed and no higher-priority work exists", 4, ())
        return Decision("wait", "no permitted work is currently available", 5, ())

    def snapshot(self) -> dict[str, Any]:
        return {
            "memories": self._conn.execute(
                "SELECT COUNT(*) FROM memories WHERE tombstoned=0"
            ).fetchone()[0],
            "goals_active": self._conn.execute(
                "SELECT COUNT(*) FROM goals WHERE status='active'"
            ).fetchone()[0],
            "beliefs_active": self._conn.execute(
                "SELECT COUNT(*) FROM beliefs WHERE status='active'"
            ).fetchone()[0],
            "procedures": self._conn.execute("SELECT COUNT(*) FROM procedures").fetchone()[0],
            "events": self._conn.execute("SELECT COUNT(*) FROM events").fetchone()[0],
        }
