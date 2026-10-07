"""Construction entry point for the persistent Mirror AI."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path

from .ai_runtime import ChatRuntime, default_runtime
from .cognition import MirrorAI
from .identity import DEFAULT_IDENTITY
from .memory import MissionMemory
from .mission import Mission, MissionState

@dataclass(frozen=True)
class MirrorConfig:
    state_dir: Path = Path(".mirror_state")
    cycle_id: str = "bootstrap"
    capability_id: str | None = None
    current_backlog: tuple[str, ...] = ()
    ledger_frontier: str | None = None
    automate_requests: tuple[str, ...] = ()
    repair_required: bool = False
    discovery_allowed: bool = False

def build_mirror_ai(config: MirrorConfig | None = None, runtime: ChatRuntime | None = None) -> MirrorAI:
    cfg = config or MirrorConfig()
    mission = Mission(
        cycle_id=cfg.cycle_id,
        capability_id=cfg.capability_id,
        current_backlog=cfg.current_backlog,
        ledger_frontier=cfg.ledger_frontier,
        automate_requests=cfg.automate_requests,
        repair_required=cfg.repair_required,
        discovery_allowed=cfg.discovery_allowed,
    )
    return MirrorAI(
        runtime=runtime or default_runtime(),
        memory=MissionMemory(cfg.state_dir / "memory.jsonl"),
        mission=MissionState(mission),
        identity=DEFAULT_IDENTITY,
    )
