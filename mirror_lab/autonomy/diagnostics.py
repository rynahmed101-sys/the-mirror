"""Shared failure diagnosis vocabulary used by verification and learning."""
from __future__ import annotations

from typing import Iterable


FAILURE_CLASSES = (
    "implementation_defect", "test_defect", "contract_schema_defect",
    "missing_assumption", "mathematical_mistake", "physics_model_mistake",
    "numerical_precision_problem", "truncation_discretization_problem",
    "backend_mismatch", "coordinate_convention_mismatch", "data_inconsistency",
    "provenance_inconsistency", "stale_revision", "ci_environment_failure",
    "security_failure", "integration_defect", "genuine_contradiction",
    "unresolved_scientific_behavior",
)


def diagnose_failure(*, message: str, evidence_kinds: Iterable[str] = ()) -> list[dict[str, int | str]]:
    text = (message + " " + " ".join(evidence_kinds)).lower()
    scores = {key: 0 for key in FAILURE_CLASSES}
    rules = {
        "stale_revision": ("stale", "sha", "commit", "revision"),
        "ci_environment_failure": ("runner", "timeout", "environment", "workflow", "action"),
        "security_failure": ("security", "codeql", "audit", "vulnerability"),
        "provenance_inconsistency": ("provenance", "lineage", "fingerprint", "receipt"),
        "test_defect": ("test", "assert", "expected output"),
        "implementation_defect": ("implementation", "wrong result", "exception"),
        "numerical_precision_problem": ("precision", "rounding", "floating", "ulp"),
        "truncation_discretization_problem": ("truncation", "cutoff", "timestep", "resolution"),
        "backend_mismatch": ("backend", "solver", "engine"),
        "missing_assumption": ("assumption", "domain", "condition"),
        "mathematical_mistake": ("identity", "derivation", "integral", "limit"),
        "genuine_contradiction": ("contradict", "disagree", "inconsistent"),
        "unresolved_scientific_behavior": ("unresolved", "unknown", "anomaly", "surprising"),
    }
    for key, tokens in rules.items():
        scores[key] = sum(1 for token in tokens if token in text)
    ranked = sorted(scores.items(), key=lambda x: (-x[1], x[0]))
    if not ranked or ranked[0][1] == 0:
        ranked = [
            ("unresolved_scientific_behavior", 1),
            ("implementation_defect", 1),
            ("test_defect", 1),
        ]
    return [
        {"failure_class": key, "score": score, "rank": i + 1}
        for i, (key, score) in enumerate(ranked[:4])
        if score > 0 or i < 2
    ]
