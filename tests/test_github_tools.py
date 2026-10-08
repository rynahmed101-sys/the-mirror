from pathlib import Path
import pytest

from mirror_lab.github_tools import GitHubTool


def test_github_branch_is_bounded():
    assert GitHubTool.validate_branch("mirror/repair-123") == "mirror/repair-123"
    with pytest.raises(ValueError):
        GitHubTool.validate_branch("main")
    with pytest.raises(ValueError):
        GitHubTool.validate_branch("feature/free-form")


def test_github_tool_never_allows_unbounded_branch():
    tool = GitHubTool(Path("."))
    with pytest.raises(ValueError):
        tool.push_branch("main")
