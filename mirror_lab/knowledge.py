"""Free, repository-native knowledge base for inference.

Knowledge is plain versioned data. No hosted vector database or paid API is
required. The brain stores experiences; this pack stores reusable facts and
procedures.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable


@dataclass(frozen=True)
class Knowledge:
    id: str
    domain: str
    trigger: tuple[str, ...]
    rule: str
    procedure: tuple[str, ...]
    source: str = "mirror-core"


KNOWLEDGE = (
    Knowledge("python.syntax", "coding", ("python", "syntax", "function", "class"), "Generated Python must parse before it can be proposed.", ("generate", "ast-parse", "test")),
    Knowledge("python.tests", "coding", ("test", "pytest", "regression"), "Every generated behavior needs an executable regression test.", ("generate-test", "run-test", "record-result")),
    Knowledge("git.exact-head", "github", ("sha", "revision", "commit", "head"), "Repository mutations must identify an exact base revision.", ("inspect-head", "compare", "mutate")),
    Knowledge("git.review", "github", ("pr", "pull", "merge", "proposal"), "Mirror can prepare reviewable changes but cannot certify or merge them.", ("branch", "push", "open-pr", "wait-for-authority")),
    Knowledge("repair.fail-closed", "repair", ("failure", "repair", "ci", "broken"), "A failed strategy is evidence against repeating that strategy.", ("capture-failure", "recall-failures", "change-strategy", "retest")),
    Knowledge("science.assumptions", "science", ("math", "physics", "derive", "proof", "simulation"), "Scientific output must expose assumptions and boundary conditions.", ("formalize", "derive", "counterexample", "independent-check")),
    Knowledge("research.provenance", "research", ("research", "paper", "reference", "evidence"), "External evidence remains untrusted until independently checked.", ("retrieve", "record-provenance", "compare", "verify")),
    Knowledge("free.tooling", "agent", ("agent", "coding", "internet", "free", "opencode", "agent-reach", "research"), "Use capable open/free specialists when available; keep their outputs untrusted and route them through the same verification boundary.", ("probe-tools", "select-specialist", "bounded-execution", "verify-output")),
)


def search(query: str, *, limit: int = 12) -> list[Knowledge]:
    tokens = set(re.findall(r"[a-z0-9_]+", query.lower()))
    scored = []
    for item in KNOWLEDGE:
        score = len(tokens.intersection(item.trigger))
        if score:
            scored.append((score, item))
    scored.sort(key=lambda x: (-x[0], x[1].id))
    return [item for _, item in scored[:limit]]
