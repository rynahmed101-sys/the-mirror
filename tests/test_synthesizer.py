from mirror_lab.synthesizer import ProgramSynthesizer

def test_synthesizes_valid_python_function():
    plan = ProgramSynthesizer().synthesize({
        "objective": "implement a utility function",
        "name": "double_value",
        "params": "x",
        "body": "return x * 2",
        "test_args": "3",
        "expected": 6,
        "target_file": "automate/backend/double.py",
    })
    assert not plan.unresolved
    assert "double_value" in plan.files[0]["content"]
    assert "assert result == 6" in plan.tests[0]["content"]

def test_unknown_intent_fails_closed():
    plan = ProgramSynthesizer().synthesize({
        "objective": "invent something completely new",
        "name": "x",
        "target_file": "x.py",
    })
    assert plan.unresolved
