from mirror_lab.toolbelt import build_tool_registry
from mirror_lab.workspace import WorkspaceTool


def test_default_toolbelt_contains_research_code_and_git(tmp_path):
    registry = build_tool_registry(workspace=WorkspaceTool(tmp_path))
    assert {"research.search", "research.fetch", "workspace.read", "workspace.write", "workspace.run", "git.status", "git.diff", "git.branch", "git.commit"} <= set(registry.tools)
