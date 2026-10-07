from mirror_lab.ai_manifest import QWEN3_30B_A3B, load_manifest
from mirror_lab.ai_runtime import DEFAULT_MODEL_ID, RuntimeConfig

def test_permanent_model_identity_is_gpt_oss_120b():
    manifest = load_manifest()
    assert manifest.model_id == DEFAULT_MODEL_ID
    assert manifest.model_id == "openai/Qwen3-30B-A3B-Instruct-2507"
    assert manifest.license == "Apache-2.0"
    assert manifest.role == "permanent_mirror_operator"

def test_manifest_is_stable_machine_data():
    assert QWEN3_30B_A3B.as_dict()["schema_version"] == "mirror.ai_model_manifest.v1"
    assert QWEN3_30B_A3B.native_context_tokens == 262144

def test_runtime_configuration_reads_model_identity(monkeypatch):
    monkeypatch.setenv("MIRROR_AI_MODEL", "openai/Qwen3-30B-A3B-Instruct-2507")
    monkeypatch.setenv("MIRROR_AI_MAX_NEW_TOKENS", "1234")
    config = RuntimeConfig.from_env()
    assert config.model_id == "openai/Qwen3-30B-A3B-Instruct-2507"
    assert config.max_new_tokens == 1234
