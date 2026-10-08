from mirror_lab.free_tools import FreeToolbelt


def test_free_toolbelt_reports_optional_capabilities(tmp_path):
    result = FreeToolbelt(tmp_path).available()
    assert set(result) == {"agent_reach", "opencode", "goose", "aider"}
    assert all(isinstance(value, bool) for value in result.values())


def test_agent_reach_missing_is_safe(tmp_path, monkeypatch):
    monkeypatch.setattr("mirror_lab.free_tools.shutil.which", lambda _name: None)
    result = FreeToolbelt(tmp_path).agent_reach_doctor()
    assert result == {"status": "UNAVAILABLE", "tool": "agent-reach"}


def test_opencode_requires_exact_revision(tmp_path, monkeypatch):
    monkeypatch.setattr("mirror_lab.free_tools.shutil.which", lambda _name: "/bin/false")
    tool = FreeToolbelt(tmp_path)
    try:
        tool.opencode_proposal(revision="not-a-sha", objective="fix a bug")
    except ValueError as exc:
        assert "exact 40-character Git SHA" in str(exc)
    else:
        raise AssertionError("invalid revision must fail closed")
