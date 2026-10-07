from mirror_lab.memory import MissionMemory
from mirror_lab.mission import Mission, MissionState

def test_memory_round_trip(tmp_path):
    m=MissionMemory(tmp_path/"memory.jsonl"); m.append("observation","test result","unit-test")
    assert "test result" in m.context()

def test_repair_priority():
    m=Mission("c1","stage1b",("issue-141",),"Taylor",(),True,False)
    assert MissionState(m).system_context()["priority"]=="repair"
