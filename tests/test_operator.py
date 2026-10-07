import pytest

from mirror_lab.operator import FrontierOperator, MissionContext


class Provider:
    def __init__(self, action):
        self.action = action

    def decide(self, system_prompt, context):
        return {"action": self.action}


def test_repair_priority_blocks_discovery():
    operator = FrontierOperator(Provider("create_capability_candidate"))
    mission = MissionContext(cycle_id="cycle", repair_required=True, discovery_allowed=True)
    with pytest.raises(ValueError):
        operator.decide(mission, {})


def test_non_repair_implementation_requires_reference_grounding():
    operator = FrontierOperator(Provider("implement"))
    mission = MissionContext(cycle_id="cycle", current_backlog=("stage1b.test",))
    with pytest.raises(ValueError):
        operator.decide(mission, {})
