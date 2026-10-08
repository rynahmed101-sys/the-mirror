import json

from mirror_lab.mission import run_mission


def test_machine_mission_emits_untrusted_result(tmp_path):
    mission = {
        "objective": "propose a new capability",
        "capability_id": "stage1b.demo",
        "brain_path": str(tmp_path / "brain.sqlite3"),
    }
    path = tmp_path / "mission.json"
    path.write_text(json.dumps(mission), encoding="utf-8")
    result = run_mission(path)
    assert result["authority"] == "UNTRUSTED_MIRROR_PROPOSAL"
    assert result["results"][-1]["result"]["proposal"]["capability"]["id"] == "stage1b.demo"
