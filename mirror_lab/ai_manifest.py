"""Machine-readable identity for the permanent Mirror AI model."""
from __future__ import annotations
from dataclasses import asdict, dataclass

@dataclass(frozen=True)
class ModelManifest:
    schema_version: str
    model_id: str
    revision: str | None
    source: str
    license: str
    runtime: str
    native_context_tokens: int
    role: str
    authority: str
    notes: tuple[str, ...]
    def as_dict(self) -> dict[str, object]:
        return asdict(self)

QWEN3_30B_A3B = ModelManifest(
    schema_version="mirror.ai_model_manifest.v1",
    model_id="Qwen/Qwen3-30B-A3B-Instruct-2507",
    revision=None,
    source="https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507",
    license="Apache-2.0",
    runtime="transformers",
    native_context_tokens=262144,
    role="permanent_mirror_operator",
    authority="operational_maintainer_and_scientific_controller_under_verification",
    notes=(
        "Open-weight model; self-hostable without provider API token quotas.",
        "30.5B parameter MoE with 3.3B active parameters; self-hostable with standard Transformers or compatible local serving.",
        "Model output is untrusted evidence until independently verified.",
        "Exact model revision must be pinned before production certification.",
    ),
)

def load_manifest() -> ModelManifest:
    return QWEN3_30B_A3B
