"""Verification & Reconciliation Engine primitives.

This module is evidence machinery, not scientific authority.  It coordinates
exact revision intake, reconciliation, diagnosis, bounded repair planning,
Automate mathematical checks, Mirror request construction, evidence lineage,
and verifiable-packet assembly.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Iterable, Mapping

from jsonschema import Draft202012Validator

from automate.backend.sympy_backend import SymPyChecker

ROOT = Path(__file__).resolve().parents[2]
REQUEST_SCHEMA = ROOT / "schemas" / "automate-verification-request-v1.json"
PACKET_SCHEMA = ROOT / "schemas" / "automate-verifiable-packet-v1.json"

class EvidenceState(str, Enum):
    UNVERIFIED = "UNVERIFIED"
    IN_PROGRESS = "IN_PROGRESS"
    VERIFIED = "VERIFIED"
    IMPLEMENTATION_VERIFIED = "IMPLEMENTATION_VERIFIED"
    PARTIALLY_SUPPORTED = "PARTIALLY_SUPPORTED"
    REPRODUCED = "REPRODUCED"
    CONTRADICTED = "CONTRADICTED"
    UNRESOLVED = "UNRESOLVED"
    FALSE = "FALSE"
    BLOCKED = "BLOCKED"
    QUARANTINED = "QUARANTINED"

EVIDENCE_TRANSITIONS = {
    EvidenceState.UNVERIFIED: {EvidenceState.IN_PROGRESS, EvidenceState.BLOCKED, EvidenceState.QUARANTINED, EvidenceState.CONTRADICTED, EvidenceState.FALSE},
    EvidenceState.IN_PROGRESS: {EvidenceState.VERIFIED, EvidenceState.PARTIALLY_SUPPORTED, EvidenceState.REPRODUCED, EvidenceState.CONTRADICTED, EvidenceState.UNRESOLVED, EvidenceState.BLOCKED, EvidenceState.QUARANTINED},
    EvidenceState.VERIFIED: {EvidenceState.REPRODUCED, EvidenceState.CONTRADICTED, EvidenceState.QUARANTINED},
    EvidenceState.IMPLEMENTATION_VERIFIED: {EvidenceState.VERIFIED, EvidenceState.REPRODUCED, EvidenceState.CONTRADICTED, EvidenceState.QUARANTINED},
    EvidenceState.PARTIALLY_SUPPORTED: {EvidenceState.VERIFIED, EvidenceState.REPRODUCED, EvidenceState.CONTRADICTED, EvidenceState.UNRESOLVED, EvidenceState.QUARANTINED},
    EvidenceState.REPRODUCED: {EvidenceState.VERIFIED, EvidenceState.CONTRADICTED, EvidenceState.QUARANTINED},
    EvidenceState.CONTRADICTED: {EvidenceState.UNRESOLVED, EvidenceState.QUARANTINED},
    EvidenceState.UNRESOLVED: {EvidenceState.IN_PROGRESS, EvidenceState.VERIFIED, EvidenceState.CONTRADICTED, EvidenceState.QUARANTINED},
    EvidenceState.FALSE: {EvidenceState.IN_PROGRESS, EvidenceState.UNRESOLVED, EvidenceState.QUARANTINED},
    EvidenceState.BLOCKED: {EvidenceState.IN_PROGRESS, EvidenceState.UNRESOLVED, EvidenceState.QUARANTINED},
    EvidenceState.QUARANTINED: {EvidenceState.UNRESOLVED},
}

def transition_evidence_state(current: EvidenceState, next_state: EvidenceState) -> EvidenceState:
    if next_state not in EVIDENCE_TRANSITIONS[current]:
        raise ValueError(f"invalid evidence transition: {current.value} -> {next_state.value}")
    return next_state

FAILURE_CLASSES = (
    "implementation_defect", "test_defect", "contract_schema_defect",
    "missing_assumption", "mathematical_mistake", "physics_model_mistake",
    "numerical_precision_problem", "truncation_discretization_problem",
    "backend_mismatch", "coordinate_convention_mismatch", "data_inconsistency",
    "provenance_inconsistency", "stale_revision", "ci_environment_failure",
    "security_failure", "integration_defect", "genuine_contradiction",
    "unresolved_scientific_behavior",
)

def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)

def sha256(value: Any) -> str:
    data = value if isinstance(value, (bytes, bytearray)) else canonical_json(value).encode()
    return hashlib.sha256(data).hexdigest()

def deterministic_id(prefix: str, *parts: Any) -> str:
    return f"{prefix}_{sha256(parts)[:32]}"

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

@dataclass(frozen=True)
class VerificationRequest:
    action_cycle_id: str
    request_id: str
    capability_id: str
    repository: str
    revision: str
    branch: str
    scope: tuple[str, ...]
    parent_ids: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": "automate.verification_request.v1",
            "action_cycle_id": self.action_cycle_id,
            "request_id": self.request_id,
            "capability_id": self.capability_id,
            "repository": self.repository,
            "revision": self.revision,
            "branch": self.branch,
            "scope": list(self.scope),
            "parent_ids": list(self.parent_ids),
        }

def build_request(*, capability_id: str, repository: str, revision: str,
                  branch: str, scope: Iterable[str],
                  action_cycle_id: str, parent_ids: Iterable[str] = (),
                  request_id: str | None = None) -> VerificationRequest:
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("verification request requires an exact 40-character commit SHA")
    rid = request_id or deterministic_id("ver", capability_id, repository, revision, list(scope))
    if not re.fullmatch(r"ver_[0-9a-f]{32}", rid):
        raise ValueError("verification request requires a deterministic ver_ identity")
    req = VerificationRequest(action_cycle_id, rid, capability_id, repository, revision,
                              branch, tuple(scope), tuple(parent_ids))
    errors = validate_schema(req.to_dict(), REQUEST_SCHEMA)
    if errors:
        raise ValueError("; ".join(errors))
    return req

def validate_schema(value: Mapping[str, Any], schema_path: Path) -> list[str]:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    return [e.message for e in Draft202012Validator(schema).iter_errors(value)]

class EvidenceGraph:
    """Append-only local receipt graph used to assemble packets.

    Chanfana remains the durable cross-service transport/persistence owner.
    This graph is the Automate-side reasoning ledger and must never mint authority.
    """
    def __init__(self, path: str | Path = "data/verification-evidence.db") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS evidence("
            "id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL,"
            "payload_json TEXT NOT NULL, payload_sha256 TEXT NOT NULL,"
            "parent_id TEXT, created_at TEXT NOT NULL)"
        )
        self.db.commit()

    def add(self, *, kind: str, state: EvidenceState, payload: Mapping[str, Any],
            parent_id: str | None = None, evidence_id: str | None = None) -> str:
        eid = evidence_id or deterministic_id("evi", kind, state.value, payload, parent_id)
        body = canonical_json(payload)
        self.db.execute(
            "INSERT OR IGNORE INTO evidence(id,kind,state,payload_json,payload_sha256,parent_id,created_at)"
            " VALUES(?,?,?,?,?,?,?)",
            (eid, kind, state.value, body, hashlib.sha256(body.encode()).hexdigest(),
             parent_id, utc_now()),
        )
        self.db.commit()
        return eid

    def get(self, evidence_id: str) -> dict[str, Any] | None:
        row = self.db.execute(
            "SELECT id,kind,state,payload_json,payload_sha256,parent_id,created_at FROM evidence WHERE id=?",
            (evidence_id,),
        ).fetchone()
        if not row:
            return None
        return {"id": row[0], "kind": row[1], "state": row[2],
                "payload": json.loads(row[3]), "payload_sha256": row[4],
                "parent_id": row[5], "created_at": row[6]}

    def close(self) -> None:
        self.db.close()

@dataclass(frozen=True)
class RepairPlan:
    repair_id: str
    base_revision: str
    reason: str
    responsible_layer: str
    allowed_paths: tuple[str, ...]
    expected_changes: tuple[Mapping[str, Any], ...]
    rollback: str
    justified: bool

def plan_bounded_repair(*, base_revision: str, reason: str,
                        responsible_layer: str, changes: Iterable[Mapping[str, Any]],
                        allowed_prefixes: Iterable[str], max_files: int = 20) -> RepairPlan:
    changes = tuple(dict(x) for x in changes)
    prefixes = tuple(str(x).rstrip("/") for x in allowed_prefixes)
    if len(changes) > max_files:
        raise ValueError("repair exceeds bounded file count")
    for change in changes:
        path = str(change.get("path", ""))
        if change.get("operation") not in {"create", "update"}:
            raise ValueError("repair deletion is forbidden")
        if not any(path == p or path.startswith(p + "/") for p in prefixes):
            raise ValueError(f"repair path outside allowed prefixes: {path}")
        if path in {
            "docs/PROJECT_PHASE_LEDGER.md", "docs/CAPABILITY_INVENTORY.json",
            ".github/workflows/ci.yml", ".github/workflows/security.yml",
        }:
            raise ValueError(f"repair may not mutate authority/security file: {path}")
    return RepairPlan(
        deterministic_id("rpr", base_revision, reason, changes),
        base_revision, reason, responsible_layer, prefixes, changes,
        "revert the isolated commit or restore the recorded preimage hashes",
        True,
    )

def diagnose_failure(*, message: str, evidence_kinds: Iterable[str] = ()) -> list[dict[str, Any]]:
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
        ranked = [("unresolved_scientific_behavior", 1), ("implementation_defect", 1),
                  ("test_defect", 1)]
    return [
        {"failure_class": key, "score": score, "rank": i + 1}
        for i, (key, score) in enumerate(ranked[:4])
        if score > 0 or i < 2
    ]

def verify_improper_integral_cases() -> list[dict[str, Any]]:
    cases = [
        ({"variable":"x","lower":"1","upper":"oo"}, "1/x**2", "1", True),
        ({"variable":"x","lower":"1","upper":"oo"}, "1/x", "0", False),
        ({"variable":"x","lower":"0","upper":"1","endpoint":"lower"}, "1/sqrt(x)", "2", True),
        ({"variable":"x","lower":"-oo","upper":"oo"}, "1/(1+x**2)", "pi", True),
        ({"variable":"x","lower":"-oo","upper":"oo"}, "exp(x)", "0", False),
        ({"variable":"x","lower":"0","upper":"1","endpoint":"upper"}, "1/sqrt(1-x)", "2", True),
    ]
    out = []
    node = lambda expr: type("Node", (), {"expression": type("Expr", (), {"raw_str": expr})()})()
    for params, integrand, claimed, expected in cases:
        passed, details, evidence, error = SymPyChecker._verify_improper_integral(
            node(integrand), node(claimed), params
        )
        out.append({
            "case": {"params": params, "integrand": integrand, "claimed": claimed},
            "passed": bool(passed), "expected": expected,
            "details": details, "evidence": evidence,
            "error": error,
        })
    return out

def mirror_verification_request(*, request: VerificationRequest,
                                hypothesis: str, inputs: Mapping[str, Any],
                                assumptions: Iterable[str], experiment_budget: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": "mirror.verification_request.v1",
        "request_id": request.request_id,
        "action_cycle_id": request.action_cycle_id,
        "capability_id": request.capability_id,
        "source_revision": request.revision,
        "experiment_type": "convergence_stability",
        "hypothesis": hypothesis,
        "inputs": dict(inputs),
        "assumptions": list(assumptions),
        "budget": dict(experiment_budget),
        "requirements": [
            "Use multiple truncation strategies where applicable.",
            "Escalate precision/resolution when convergence is sensitive.",
            "Record numerical error, stability/convergence, and limitations.",
            "Return observations, never certification.",
        ],
    }

def reconcile_snapshot(*, requested_revision: str, snapshot: Mapping[str, Any],
                       claimed: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Compare claimed state to observed live state without guessing."""
    observed_main = snapshot.get("main_sha")
    observed_engine = snapshot.get("engine_sha")
    findings: list[dict[str, Any]] = []
    target_branch = snapshot.get("requested_branch") or "main"
    target_key = "main_sha" if target_branch == "main" else "engine_sha" if target_branch == "engine" else "target_sha"
    observed_target = snapshot.get(target_key)
    if observed_target and requested_revision != observed_target:
        findings.append({"kind":"stale_revision","state":EvidenceState.BLOCKED.value,
                         "detail":f"requested {requested_revision}, live {target_key} is {observed_target}"})
    if claimed:
        for key in ("main_sha", "exact_head_sha", "security_run_ids"):
            if key in claimed and claimed.get(key) != snapshot.get(key):
                findings.append({"kind":"provenance_mismatch","state":EvidenceState.UNRESOLVED.value,
                                 "detail":f"claimed {key}={claimed.get(key)!r}, observed {snapshot.get(key)!r}"})
    if snapshot.get("exact_head_verified") is not True:
        findings.append({"kind":"exact_head_missing","state":EvidenceState.BLOCKED.value,
                         "detail":"no exact-head verification bound to the requested current revision"})
    if snapshot.get("security_verified") is not True:
        findings.append({"kind":"security_missing","state":EvidenceState.BLOCKED.value,
                         "detail":"no current Security Audit evidence bound to the requested revision"})
    return {
        "observed_main_sha": observed_main,
        "observed_engine_sha": observed_engine,
        "requested_revision": requested_revision,
        "findings": findings,
        "diagnoses": [diagnose_failure(message=f["detail"], evidence_kinds=[f["kind"]])
                      for f in findings],
        "ready_for_authoritative_promotion": not findings,
    }


def action_evidence(snapshot: Mapping[str, Any], revision: str) -> dict[str, Any]:
    runs = (
        list(snapshot.get("workflow_runs_main", []))
        + list(snapshot.get("workflow_runs_engine", []))
        + list(snapshot.get("workflow_runs_target", []))
    )
    exact = [
        r for r in runs
        if r.get("head_sha") == revision
        and r.get("status") == "completed"
        and r.get("conclusion") == "success"
    ]
    security = [
        r for r in exact
        if "security" in str(r.get("name", "")).lower()
        or "audit" in str(r.get("name", "")).lower()
    ]
    ci = [
        r for r in exact
        if "ci" in str(r.get("name", "")).lower()
        or "test" in str(r.get("name", "")).lower()
    ]
    return {
        "exact_head_verified": bool(ci),
        "security_verified": bool(security),
        "ci_run_ids": [int(r["id"]) for r in ci if str(r.get("id", "")).isdigit()],
        "security_run_ids": [int(r["id"]) for r in security if str(r.get("id", "")).isdigit()],
        "matching_success_runs": [int(r["id"]) for r in exact if str(r.get("id", "")).isdigit()],
    }


def apply_bounded_repair(*, root: str | Path, plan: RepairPlan) -> list[dict[str, Any]]:
    root_path = Path(root).resolve()
    records: list[dict[str, Any]] = []
    for change in plan.expected_changes:
        path = str(change["path"])
        target = (root_path / path).resolve()
        try:
            target.relative_to(root_path)
        except ValueError as exc:
            raise ValueError(f"repair escapes checkout: {path}") from exc
        if change.get("operation") == "create" and target.exists():
            raise ValueError(f"repair create target already exists: {path}")
        if change.get("operation") == "update":
            if not target.is_file():
                raise ValueError(f"repair target missing: {path}")
            expected = change.get("expected_sha256")
            if expected and hashlib.sha256(target.read_bytes()).hexdigest() != expected:
                raise ValueError(f"repair preimage hash mismatch: {path}")
        content = change.get("content")
        if not isinstance(content, str):
            raise ValueError(f"repair requires textual content: {path}")
        before = hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        after = hashlib.sha256(target.read_bytes()).hexdigest()
        records.append({
            "path": path,
            "before_sha256": before,
            "after_sha256": after,
            "repair_id": plan.repair_id,
        })
    return records


def run_backlog_item(
    *, capability_id: str, repository: str, revision: str, branch: str,
    action_cycle_id: str, snapshot: Mapping[str, Any], evidence_db: str | Path,
    request_id: str | None = None
) -> dict[str, Any]:
    request = build_request(
        capability_id=capability_id,
        repository=repository,
        revision=revision,
        branch=branch,
        scope=["inventory", "diagnosis", "mathematical", "computational", "ci", "security", "provenance"],
        action_cycle_id=action_cycle_id,
        request_id=request_id,
    )
    graph = EvidenceGraph(evidence_db)
    request_id = graph.add(
        kind="verification_request",
        state=EvidenceState.IN_PROGRESS,
        payload=request.to_dict(),
    )
    snap = dict(snapshot)
    snap["requested_branch"] = branch
    snap["requested_revision"] = revision
    reconciliation = reconcile_snapshot(requested_revision=revision, snapshot=snap)
    reconciliation_id = graph.add(
        kind="reconciliation",
        state=EvidenceState.BLOCKED if reconciliation["findings"] else EvidenceState.VERIFIED,
        payload=reconciliation,
        parent_id=request_id,
    )
    capability_specific_math = capability_id == "stage1b.improper_integrals"
    math_results = verify_improper_integral_cases() if capability_specific_math else []
    math_ok = capability_specific_math and bool(math_results) and all(
        row["passed"] is row["expected"] for row in math_results
    )
    math_state = (
        EvidenceState.VERIFIED
        if capability_specific_math and math_ok
        else EvidenceState.CONTRADICTED
        if capability_specific_math
        else EvidenceState.UNVERIFIED
    )
    math_id = graph.add(
        kind="mathematical_check",
        state=math_state,
        payload={
            "cases": math_results,
            "capability_specific_adapter": capability_specific_math,
        },
        parent_id=reconciliation_id,
    )

    actions = action_evidence(snap, revision)
    actions_id = graph.add(
        kind="ci_security",
        state=(
            EvidenceState.VERIFIED
            if actions["exact_head_verified"] and actions["security_verified"]
            else EvidenceState.BLOCKED
        ),
        payload=actions,
        parent_id=math_id,
    )

    mirror_request = None
    mirror_id = None
    mirror_result = None
    mirror_evidence_id = None
    mirror_required = capability_specific_math
    mirror_enabled = (
        mirror_required
        and __import__("os").getenv("AUTOMATE_MIRROR_VERIFICATION_ENABLED", "").strip().lower()
        in {"1", "true", "yes"}
    )

    if mirror_required:
        mirror_request = mirror_verification_request(
            request=request,
            hypothesis=(
                "independent convergence/stability check for improper-integral behavior"
            ),
            inputs={"integrand": "1/(1+x**2)", "lower": "-oo", "upper": "oo"},
            assumptions=(),
            experiment_budget={
                "max_precision": 80,
                "max_truncation": 8,
                "max_runtime_ms": 30000,
            },
        )
        mirror_id = graph.add(
            kind="mirror_request",
            state=EvidenceState.IN_PROGRESS,
            payload=mirror_request,
            parent_id=math_id,
        )

        if mirror_enabled:
            try:
                from automate.dev.mirror_verification_client import run_mirror_verification

                mirror_result = run_mirror_verification(mirror_request)
                mirror_state = (
                    EvidenceState.REPRODUCED
                    if mirror_result.get("status") == "REPRODUCED"
                    else EvidenceState.UNRESOLVED
                    if mirror_result.get("status") == "UNRESOLVED"
                    else EvidenceState.CONTRADICTED
                )
                mirror_evidence_id = graph.add(
                    kind="mirror_experimental_result",
                    state=mirror_state,
                    payload=mirror_result,
                    parent_id=mirror_id,
                )
            except Exception as exc:
                mirror_result = {
                    "status": "UNRESOLVED",
                    "error": str(exc),
                    "authority": "UNTRUSTED_EXPERIMENTAL_OBSERVATION",
                }
                mirror_evidence_id = graph.add(
                    kind="mirror_experimental_result",
                    state=EvidenceState.BLOCKED,
                    payload=mirror_result,
                    parent_id=mirror_id,
                )

    mirror_ok = (
        not mirror_enabled
        or (isinstance(mirror_result, dict) and mirror_result.get("status") == "REPRODUCED")
    )
    no_reconciliation_findings = not reconciliation["findings"]

    if not no_reconciliation_findings or not actions["exact_head_verified"] or not actions["security_verified"]:
        state = EvidenceState.BLOCKED
    elif capability_specific_math and not math_ok:
        state = EvidenceState.CONTRADICTED
    elif mirror_required and not mirror_ok:
        state = EvidenceState.UNRESOLVED
    elif capability_specific_math:
        state = EvidenceState.VERIFIED
    else:
        state = EvidenceState.IMPLEMENTATION_VERIFIED

    packet = build_verifiable_packet(
        request=request,
        graph_ids=[
            request_id,
            reconciliation_id,
            math_id,
            actions_id,
            *([mirror_id] if mirror_id else []),
            *([mirror_evidence_id] if mirror_evidence_id else []),
        ],
        repository_state={**snap, "evidence_state": state.value},
        tests=["python -m pytest -q tests/test_improper_integrals.py"],
        ci_run_ids=actions["ci_run_ids"],
        security_run_ids=actions["security_run_ids"],
        math_evidence={"state": math_state.value, "cases_checked": len(math_results)},
        computational_evidence={
            "state": (
                EvidenceState.REPRODUCED.value
                if isinstance(mirror_result, dict) and mirror_result.get("status") == "REPRODUCED"
                else EvidenceState.UNVERIFIED.value
            ),
            "alternate_route": "Mirror verification is untrusted experimental evidence; no certification is inferred.",
            "mirror_experimental_evidence_id": mirror_evidence_id,
        },
        provenance_evidence={
            "source_revision": revision,
            "reconciliation_evidence_id": reconciliation_id,
        },
        mirror_experiment_ids=(
            [str(mirror_result.get("experiment_id"))]
            if isinstance(mirror_result, dict) and mirror_result.get("experiment_id")
            else []
        ),
        unresolved=[
            *[f["detail"] for f in reconciliation["findings"]],
            *(
                ["capability-specific mathematical verifier failed"]
                if capability_specific_math and math_state == EvidenceState.CONTRADICTED
                else []
            ),
            *(
                ["Mirror independent verification is unresolved"]
                if mirror_required and mirror_enabled and not mirror_ok
                else []
            ),
        ],
        limitations=(
            ["The verifier cannot certify or promote."]
            + ([] if capability_specific_math else ["No capability-specific mathematical adapter is registered; implementation evidence is reported separately."])
            + ([] if actions["exact_head_verified"] else ["Exact-head CI evidence is missing."])
            + ([] if actions["security_verified"] else ["Security Audit evidence is missing."])
            + (["Mirror verification is disabled for this cycle."] if mirror_required and not mirror_enabled else [])
        ),
    )
    graph.close()
    return {
        "request": request.to_dict(),
        "reconciliation": reconciliation,
        "actions": actions,
        "math": math_results,
        "packet": packet,
        "mirror_request": mirror_request,
        "mirror_result": mirror_result,
        "evidence_state": state.value,
    }



def validate_packet_consistency(
    packet: Mapping[str, Any],
    *,
    request: VerificationRequest,
    repository_state: Mapping[str, Any],
) -> list[str]:
    """Validate evidence identity and gate conditions beyond JSON schema shape."""
    errors: list[str] = []
    if packet.get("authority") != "EVIDENCE_ONLY":
        errors.append("packet authority must be EVIDENCE_ONLY")
    if packet.get("action_cycle_id") != request.action_cycle_id:
        errors.append("packet action_cycle_id does not match request")
    if packet.get("capability_id") != request.capability_id:
        errors.append("packet capability_id does not match request")
    if packet.get("repository") != request.repository:
        errors.append("packet repository does not match request")
    if packet.get("exact_commit_sha") != request.revision:
        errors.append("packet exact_commit_sha does not match request revision")
    expected_packet = deterministic_id(
        "pkt", request.request_id, request.revision, packet.get("evidence_graph_ids", [])
    )
    if packet.get("packet_id") != expected_packet:
        errors.append("packet_id is not content-bound to request revision and evidence graph")
    for key in ("ci_run_ids", "security_run_ids", "evidence_graph_ids"):
        if not isinstance(packet.get(key), list):
            errors.append(f"packet {key} missing")
    state = str(packet.get("evidence_state", ""))
    if state in {EvidenceState.VERIFIED.value, EvidenceState.IMPLEMENTATION_VERIFIED.value}:
        if repository_state.get("exact_head_verified") is not True:
            errors.append(f"{state} packet lacks exact-head verification")
        if repository_state.get("security_verified") is not True:
            errors.append(f"{state} packet lacks security verification")
    if repository_state.get("requested_revision") and repository_state.get("requested_revision") != request.revision:
        errors.append("repository snapshot revision does not match request")
    return errors
def build_verifiable_packet(*, request: VerificationRequest,
                            graph_ids: Iterable[str], repository_state: Mapping[str, Any],
                            tests: Iterable[str], ci_run_ids: Iterable[int],
                            security_run_ids: Iterable[int], math_evidence: Mapping[str, Any],
                            computational_evidence: Mapping[str, Any],
                            provenance_evidence: Mapping[str, Any],
                            mirror_experiment_ids: Iterable[str] = (),
                            repair_history: Iterable[Mapping[str, Any]] = (),
                            unresolved: Iterable[str] = (),
                            limitations: Iterable[str] = ()) -> dict[str, Any]:
    packet = {
        "schema_version": "automate.verifiable_packet.v1",
        "packet_id": deterministic_id("pkt", request.request_id, request.revision, list(graph_ids)),
        "action_cycle_id": request.action_cycle_id,
        "capability_id": request.capability_id,
        "job_id": repository_state.get("job_id"),
        "result_ids": list(repository_state.get("result_ids", [])),
        "repository": request.repository,
        "exact_commit_sha": request.revision,
        "tree_sha": repository_state.get("tree_sha"),
        "branch": request.branch,
        "pr_number": repository_state.get("pr_number"),
        "changed_file_hashes": list(repository_state.get("changed_file_hashes", [])),
        "tests": list(tests),
        "ci_run_ids": list(ci_run_ids),
        "security_run_ids": list(security_run_ids),
        "verifier_version": "verification-engine.v1",
        "rule_set_hash": sha256({"module":"automate.dev.verification_engine","version":"v1"}),
        "mathematical_evidence": dict(math_evidence),
        "computational_evidence": dict(computational_evidence),
        "data_provenance_evidence": dict(provenance_evidence),
        "mirror_experiment_ids": list(mirror_experiment_ids),
        "evidence_state": repository_state.get("evidence_state", EvidenceState.UNRESOLVED.value),
        "external_source_ids": list(repository_state.get("external_source_ids", [])),
        "assumptions": list(repository_state.get("assumptions", [])),
        "tolerances": dict(repository_state.get("tolerances", {})),
        "repair_history": [dict(x) for x in repair_history],
        "unresolved": list(unresolved),
        "limitations": list(limitations),
        "evidence_graph_ids": list(graph_ids),
        "authority": "EVIDENCE_ONLY",
    }
    errors = validate_schema(packet, PACKET_SCHEMA)
    if errors:
        raise ValueError("; ".join(errors))
    return packet

def gh_api(path: str, *, timeout: int = 30) -> Any:
    """Bounded live GitHub reader used by the verification engine."""
    if not path.startswith("/"):
        raise ValueError("GitHub API paths must be absolute")

    token = __import__("os").getenv("GH_TOKEN") or __import__("os").getenv("GITHUB_TOKEN")
    if token:
        raw = None
        last_error = ""
        for attempt in range(3):
            proc = subprocess.run(
                ["gh", "api", path, "--method", "GET"],
                capture_output=True, text=True, timeout=timeout, check=False,
            )
            if proc.returncode == 0:
                raw = proc.stdout
                break
            last_error = proc.stderr.strip()
            if " 500 " not in last_error and "HTTP 500" not in last_error and "Internal Server Error" not in last_error:
                break
            if attempt < 2:
                __import__("time").sleep(1.0 * (attempt + 1))
        if raw is None:
            raise RuntimeError(f"GitHub read failed after bounded retries: {last_error}")
    else:
        credential = subprocess.run(
            ["git", "config", "--get", "http.https://github.com/.extraheader"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        ).stdout.strip()
        command = [
            "curl", "--fail", "--silent", "--show-error",
            "--header", "Accept: application/vnd.github+json",
            "--header", "X-GitHub-Api-Version: 2022-11-28",
        ]
        if credential:
            command.extend(["--header", credential])
        command.append("https://api.github.com" + path)
        raw = None
        last_error = ""
        for attempt in range(3):
            proc = subprocess.run(
                command,
                capture_output=True, text=True, timeout=timeout, check=False,
            )
            if proc.returncode == 0:
                raw = proc.stdout
                break
            last_error = proc.stderr.strip()
            if " 500 " not in last_error and "HTTP 500" not in last_error and "Internal Server Error" not in last_error:
                break
            if attempt < 2:
                __import__("time").sleep(1.0 * (attempt + 1))
        if raw is None:
            raise RuntimeError(f"GitHub read failed after bounded retries: {last_error}")

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("GitHub returned non-JSON verification data") from exc

def live_repository_snapshot(repository: str, requested_branch: str = "main") -> dict[str, Any]:
    if not re.fullmatch(r"[A-Za-z0-9._/-]{1,255}", requested_branch):
        raise ValueError("requested branch contains unsafe characters")
    if requested_branch.startswith("/") or ".." in requested_branch.split("/"):
        raise ValueError("requested branch contains unsafe path segments")

    main = gh_api(f"/repos/{repository}/git/ref/heads/main")
    engine = gh_api(f"/repos/{repository}/git/ref/heads/engine")
    target = gh_api(f"/repos/{repository}/git/ref/heads/{requested_branch}")
    main_sha = str(main["object"]["sha"])
    engine_sha = str(engine["object"]["sha"])
    target_sha = str(target["object"]["sha"])
    runs_main = gh_api(f"/repos/{repository}/actions/runs?branch=main&per_page=100")
    runs_engine = gh_api(f"/repos/{repository}/actions/runs?branch=engine&per_page=100")
    runs_target = gh_api(
        f"/repos/{repository}/actions/runs?branch={requested_branch}&per_page=100"
    )
    status = gh_api(f"/repos/{repository}/commits/{target_sha}/status")
    prs = gh_api(f"/repos/{repository}/pulls?state=all&per_page=100")
    compare = gh_api(f"/repos/{repository}/compare/main...engine")
    return {
        "repository": repository,
        "main_sha": main_sha,
        "engine_sha": engine_sha,
        "requested_branch": requested_branch,
        "requested_revision": target_sha,
        "target_sha": target_sha,
        "workflow_runs_main": runs_main.get("workflow_runs", []),
        "workflow_runs_engine": runs_engine.get("workflow_runs", []),
        "workflow_runs_target": runs_target.get("workflow_runs", []),
        "combined_status": status,
        "pull_requests": prs,
        "compare": compare,
    }
