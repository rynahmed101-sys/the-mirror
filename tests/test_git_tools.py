from mirror_lab.git_tools import GitTool


def test_git_push_is_forbidden(tmp_path):
    tool = GitTool(tmp_path)
    try:
        tool.push("origin", "main")
    except PermissionError:
        pass
    else:
        raise AssertionError("remote push must remain unavailable")
