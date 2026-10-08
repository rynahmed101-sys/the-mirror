from pathlib import Path
import pytest

from mirror_lab.workspace import WorkspaceTool


def test_workspace_run_allows_only_bounded_verification(tmp_path: Path):
    tool = WorkspaceTool(tmp_path)
    result = tool.run(["git", "status", "--short"])
    assert result["returncode"] == 0
    with pytest.raises(ValueError):
        tool.run(["python", "-c", "open('pwned','w').write('x')"])
    with pytest.raises(ValueError):
        tool.run(["git", "push", "origin", "main"])
