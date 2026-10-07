from pathlib import Path

from mirror_lab.builtin_tools import build_default_tool_registry
from mirror_lab.reasoning import SpecialistName


def test_default_tool_registry_has_coding_research_and_github_boundaries(tmp_path: Path):
    registry = build_default_tool_registry(workspace_root=tmp_path)
    assert registry.get("research.search").specialist is SpecialistName.RESEARCH
    assert registry.get("workspace.write").specialist is SpecialistName.CODING
    assert registry.get("git.status").specialist is SpecialistName.GITHUB
    assert registry.get("workspace.write").authorization_required is True
    assert registry.get("git.commit").authorization_required is True


def test_default_tool_registry_never_exposes_remote_push(tmp_path: Path):
    registry = build_default_tool_registry(workspace_root=tmp_path)
    assert "git.push" not in registry.names()


def test_workspace_and_git_tools_are_bounded(tmp_path: Path):
    registry = build_default_tool_registry(workspace_root=tmp_path)
    write_result = registry.invoke(
        "workspace.write",
        {"path": "sample.txt", "content": "ok"},
        __import__("mirror_lab.tooling", fromlist=["ToolContext"]).ToolContext(
            cycle_id="cycle_test_12345678",
            mission_id="mission_test_12345678",
            objective="write sample",
            specialist=SpecialistName.CODING,
            authorization_granted=True,
        ),
    )
    assert write_result.succeeded is True
    assert (tmp_path / "sample.txt").read_text() == "ok"
