import json
from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_machine_contracts_are_versioned_and_fail_closed():
    expected = {
        "mission": "mirror.mission.v1",
        "task": "mirror.task.v1",
        "action": "mirror.action.v1",
        "evidence": "mirror.evidence.v1",
    }
    for name, version in expected.items():
        schema = json.loads((ROOT / "contracts" / f"{name}.schema.json").read_text())
        assert schema["properties"]["schema_version"]["const"] == version
        assert schema["additionalProperties"] is False

    action = json.loads((ROOT / "contracts/action.schema.json").read_text())
    evidence = json.loads((ROOT / "contracts/evidence.schema.json").read_text())
    assert action["properties"]["self_certified"]["const"] is False
    assert "confidence" in evidence["required"]
    assert "authority" in evidence["required"]
