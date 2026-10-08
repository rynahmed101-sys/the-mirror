from mirror_lab.recipes import add_import, append_function, replace_exact

def test_append_function():
    out = append_function("x = 1\n", "double", "x", "return x * 2")
    compile(out, "<generated>", "exec")
    assert "def double" in out

def test_import_is_checked():
    assert add_import("x = 1\n", "import math").startswith("import math")

def test_replace_requires_exact_match():
    assert replace_exact("x=1\nx=2\n", "x=2", "x=3").endswith("x=3\n")
