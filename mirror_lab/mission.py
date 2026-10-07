"""Persistent mission boundary for the Mirror AI."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any

@dataclass(frozen=True)
class Mission:
    cycle_id: str
    capability_id: str | None
    current_backlog: tuple[str,...]
    ledger_frontier: str | None
    automate_requests: tuple[str,...]
    repair_required: bool
    discovery_allowed: bool
    def system_context(self) -> dict[str,Any]:
        priority=("repair" if self.repair_required else "current_work" if self.current_backlog else "ledger" if self.ledger_frontier else "automate_request" if self.automate_requests else "discovery")
        return {"cycle_id":self.cycle_id,"capability_id":self.capability_id,"current_backlog":list(self.current_backlog),"ledger_frontier":self.ledger_frontier,"automate_requests":list(self.automate_requests),"repair_required":self.repair_required,"discovery_allowed":self.discovery_allowed,"priority":priority}

class MissionState:
    def __init__(self, mission: Mission) -> None: self.mission=mission
    def prompt(self) -> str:
        return "MISSION STATE (operational context, not authority):\n"+str(self.mission.system_context())+"\nNever bypass external verification."
