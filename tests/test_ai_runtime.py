from mirror_lab.ai_manifest import QWEN3_30B_A3B, load_manifest
from mirror_lab.ai_runtime import DEFAULT_MODEL_ID, RuntimeConfig
from mirror_lab.agent import PermanentAgent

def test_permanent_model_identity_is_qwen():
    manifest = load_manifest()
    assert manifest.model_id == DEFAULT_MODEL_ID
    assert manifest.model_id == "Qwen/Qwen3-30B-A3B-Instruct-2507"
    assert manifest.license == "Apache-2.0"
    assert manifest.role == "permanent_mirror_operator"

def test_manifest_is_stable_machine_data():
    assert QWEN3_30B_A3B.as_dict()["schema_version"] == "mirror.ai_model_manifest.v1"
    assert QWEN3_30B_A3B.native_context_tokens == 262144

def test_runtime_configuration_reads_model_identity(monkeypatch):
    monkeypatch.setenv("MIRROR_AI_MODEL", "Qwen/Qwen3-30B-A3B-Instruct-2507")
    monkeypatch.setenv("MIRROR_AI_MAX_NEW_TOKENS", "1234")
    config = RuntimeConfig.from_env()
    assert config.model_id == "Qwen/Qwen3-30B-A3B-Instruct-2507"
    assert config.max_new_tokens == 1234

class FakeRuntime:
    def __init__(self):
        self.calls = 0
    def generate(self, messages, *, max_new_tokens=2048, tools=None):
        self.calls += 1
        if self.calls == 1:
            return '<tool_call>{"name":"add","arguments":{"a":2,"b":3}}</tool_call>'
        return "verified externally later"

def test_bounded_tool_loop_executes_requested_tool():
    agent = PermanentAgent(FakeRuntime())
    agent.register_tool("add", lambda a, b: a + b)
    assert agent.run("calculate", max_steps=2) == "verified externally later"
