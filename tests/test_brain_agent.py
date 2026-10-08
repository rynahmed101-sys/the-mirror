from mirror_lab.agent import MirrorAgent, Mission
from mirror_lab.brain import MemoryKind, MirrorBrain


def test_brain_persists_memory_goals_and_beliefs(tmp_path):
    path = tmp_path / "brain.sqlite3"
    brain = MirrorBrain(path)
    brain.observe("Taylor expansion is the current frontier", kind=MemoryKind.PROJECT, source="ledger", confidence=1.0)
    brain.set_goal("finish the current frontier", priority=10)
    brain.assert_belief("the ledger is authoritative", confidence=1.0, evidence="ledger")
    brain.close()

    reopened = MirrorBrain(path)
    recalls = reopened.recall("current frontier")
    assert recalls
    assert reopened.active_goals()[0].priority == 10
    assert reopened.belief(1).confidence == 1.0
    reopened.close()


def test_reasoning_routes_and_records_tool_plan(tmp_path):
    brain = MirrorBrain(tmp_path / "brain.sqlite3")
    agent = MirrorAgent(brain=brain)
    plan = agent.plan(Mission("research and repair a GitHub capability"))
    assert plan[0] == "list_tools"
    assert "research_world" in plan
    assert "repair_automate_change" in plan
    events = brain.self_audit()
    assert any(item["event_type"] == "planner_route" for item in events)
    brain.close()


def test_untrusted_mission_result_boundary(tmp_path):
    brain = MirrorBrain(tmp_path / "brain.sqlite3")
    agent = MirrorAgent(brain=brain)
    result = agent.execute_plan(
        Mission("propose a capability"),
        [{"tool": "propose_capability", "arguments": {
            "id": "demo.x", "name": "Demo", "summary": "candidate"
        }}],
    )
    assert result[0]["result"]["proposal"]["authority"] == "UNTRUSTED_MIRROR_PROPOSAL"
    brain.close()
