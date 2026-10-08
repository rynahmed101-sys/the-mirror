from mirror_lab.agent import MirrorAgent, Mission


def test_toolbelt_is_executable_and_explicit():
    agent = MirrorAgent()
    names = agent.tools.names()
    assert "research_world" in names
    assert "implement_automate_change" in names
    assert "repair_automate_change" in names
    assert "propose_capability" in names
    assert "github_publish_automate_patch" in names


def test_planner_selects_research_then_capability_work():
    agent = MirrorAgent()
    plan = agent.plan(Mission("research approaches and implement a new capability"))
    assert plan[0] == "list_tools"
    assert "research_world" in plan
    assert "implement_automate_change" in plan


def test_capability_proposal_is_untrusted():
    result = MirrorAgent().tools.execute(
        "propose_capability",
        {"id": "demo.x", "name": "Demo", "summary": "candidate"},
    )
    assert result["status"] == "CANDIDATE"
    assert result["proposal"]["authority"] == "UNTRUSTED_MIRROR_PROPOSAL"


def test_planner_does_not_infer_implementation_from_proposal():
    plan = MirrorAgent().plan(Mission("propose a new capability"))
    assert "propose_capability" in plan
    assert "implement_automate_change" not in plan

def test_publish_requires_explicit_authorization():
    result = MirrorAgent().tools.execute(
        "github_publish_automate_patch",
        {
            "base_revision": "a" * 40,
            "patch": "diff --git a/example.txt b/example.txt\\n",
            "branch": "mirror/test-publication",
            "title": "test publication",
            "body": "untrusted test",
            "authorization_granted": False,
        },
    )
    assert result["status"] == "AUTHORIZATION_DENIED"
