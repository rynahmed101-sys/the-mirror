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

GPT_OSS_120B = ModelManifest(
    schema_version="mirror.ai_model_manifest.v1",
    model_id="openai/gpt-oss-120b",
    revision=None,
    source="https://huggingface.co/openai/gpt-oss-120b",
    license="Apache-2.0",
    runtime="transformers",
    native_context_tokens=131072,
    role="permanent_mirror_operator",
    authority="operational_maintainer_and_scientific_controller_under_verification",
    notes=(
        "Open-weight model; self-hostable without provider API token quotas.",
        "Native MXFP4 deployment target is a single 80GB GPU.",
        "Model output is untrusted evidence until independently verified.",
        "Exact model revision must be pinned before production certification.",
    ),
)

def load_manifest() -> ModelManifest:
    return GPT_OSS_120B
