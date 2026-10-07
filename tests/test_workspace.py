from mirror_lab.workspace import WorkspaceTool


def test_workspace_cannot_escape(tmp_path):
    tool = WorkspaceTool(tmp_path)
    try:
        tool.read("../outside")
    except ValueError as exc:
        assert "escapes" in str(exc)
    else:
        raise AssertionError("workspace escape was accepted")


def test_workspace_write_and_run(tmp_path):
    tool = WorkspaceTool(tmp_path)
    tool.write("hello.py", "print('ok')")
    result = tool.run(["python", "hello.py"])
    assert result["returncode"] == 0
