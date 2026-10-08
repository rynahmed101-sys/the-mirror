"""Evaluate whether Automate has earned permission to enable autonomous workers."""

from __future__ import annotations

import base64
import re
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from automate.dev.live import summarize_live
from automate.dev.worker_client import WorkerTransportError, _request_json, worker_api_url, worker_token


REQUIRED_GATES = (
    "worker_contract_tested",
    "verification_engine_configured",
    "worker_api_authenticated_bounded",
    "worker_transport_live",
    "worker_output_independently_validated",
    "github_lifecycle_exercised",
    "live_control_plane_clean",
    "exact_head_authority_current",
    "end_to_end_dry_run_passed",
    "autonomous_foundation_merged_main",
    "engine_trunk_verified",
)


def evaluate_readiness(evidence: dict[str, Any]) -> dict[str, Any]:
    failures = [gate for gate in REQUIRED_GATES if evidence.get(gate) is not True]
    bootstrap_blockers = [gate for gate in failures if gate != "github_lifecycle_exercised"]
    bootstrap_ready = not bootstrap_blockers and "github_lifecycle_exercised" in failures
    return {
        "schema_version": "automate.autonomy_readiness.v1",
        "ready": not failures,
        "bootstrap_ready": bootstrap_ready,
        "gates": {gate: evidence.get(gate) is True for gate in REQUIRED_GATES},
        "blocking_gates": failures,
        "worker_mode": "enabled" if not failures else "off",
        "policy": (
            "Workers may be enabled only when every required gate is true."
            if failures
            else "Autonomous workers are eligible for bounded activation; merge/certification authority remains gated."
        ),
    }


def _gh_json(repository: str, *args: str) -> Any:
    env = os.environ.copy()
    if not env.get("GH_TOKEN") and not env.get("GITHUB_TOKEN"):
        raise RuntimeError("GH_TOKEN or GITHUB_TOKEN is required for automatic readiness inspection")
    endpoint = "repos/" + repository
    if args:
        endpoint += "/" + "/".join(arg.strip("/") for arg in args)
    result = subprocess.run(
        ["gh", "api", endpoint],
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "GitHub query failed")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("GitHub query returned invalid JSON") from exc


def _workflow_success(repository: str, workflow_file: str, commit_sha: str) -> bool:
    env = os.environ.copy()
    if not env.get("GH_TOKEN") and not env.get("GITHUB_TOKEN"):
        return False
    result = subprocess.run(
        [
            "gh", "run", "list",
            "--repo", repository,
            "--workflow", workflow_file,
            "--commit", commit_sha,
            "--status", "completed",
            "--limit", "20",
            "--json", "databaseId,conclusion",
        ],
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    if result.returncode != 0:
        return False
    try:
        runs = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return False
    return any(
        run.get("conclusion") == "success"
        for run in runs
        if isinstance(run, dict)
    )


def _github_content_exists(repository: str, path: str, ref: str) -> bool:
    try:
        _gh_json(repository, f"/contents/{path}?ref={ref}")
        return True
    except Exception:
        return False


def _github_lifecycle_exercised(repository: str) -> bool:
    """Return true only after a real worker-created capability reached verified main."""
    try:
        prs = _gh_json(repository, "/pulls?state=closed&base=main&per_page=100")
    except Exception:
        return False
    if not isinstance(prs, list):
        return False
    for pr in prs:
        if not isinstance(pr, dict) or not pr.get("merged_at"):
            continue
        head = pr.get("head", {})
        if not isinstance(head, dict) or not str(head.get("ref", "")).startswith("feat/"):
            continue
        body = str(pr.get("body") or "")
        capability_match = re.search(r"(?m)^- capability:\s*([a-z0-9][a-z0-9_.-]*)\s*$", body)
        worker_request = re.search(r"(?m)^- worker_request_id:\s*([A-Za-z0-9_.:-]{8,128})\s*$", body)
        base_match = re.search(r"(?m)^- base_sha:\s*([0-9a-f]{40})\s*$", body)
        if not capability_match or not worker_request or not base_match:
            continue
        capability_id = capability_match.group(1)
        base_sha = base_match.group(1)
        head_branch = str(pr.get("head", {}).get("ref") or "")
        # Accept both the current deterministic worker branch identity and
        # the legacy bounded-worker identity used by the first promoted
        # machine-generated capability. The lifecycle gate is evidence-only:
        # merged main + exact CI + Security Audit remain mandatory.
        current_branch = "feat/" + capability_id + "-" + base_sha[:12]
        legacy_branch = "feat/" + capability_id + "-" + worker_request.group(1)[4:12]
        if head_branch not in {current_branch, legacy_branch}:
            continue
        if not re.fullmatch(r"wrk_[0-9a-f]{32}", worker_request.group(1)):
            continue
        merge_sha = str(pr.get("merge_commit_sha") or "")
        if len(merge_sha) != 40:
            continue
        if _workflow_success(repository, "ci.yml", merge_sha) and _workflow_success(repository, "security.yml", merge_sha):
            return True
    return False


def _foundation_present_on_main(repository: str) -> bool:
    """Require the autonomous foundation to actually exist on live main.

    A PR number is bookkeeping, not authority. A stale/open PR must not block
    readiness when the required foundation is already present on main, and an
    apparently merged PR must not satisfy the gate if its required files are
    absent from main.
    """
    required_files = (
        "automate/dev/autonomous.py",
        "automate/dev/readiness.py",
        "automate/dev/worker_client.py",
        "automate/dev/executor.py",
        "automate/dev/publisher.py",
        "schemas/automate-worker-v1.json",
        "schemas/automate-worker-result-v1.json",
    )
    return all(_github_content_exists(repository, path, "main") for path in required_files)


def collect_readiness_evidence(
    repository: str,
    *,
    worker_repository: str = "rynahmed101-sys/chanfana-openapi-template",
) -> dict[str, Any]:
    evidence: dict[str, Any] = {}
    errors: list[str] = []

    try:
        ref = _gh_json(repository, "/git/ref/heads/main")
        main_sha = ref.get("object", {}).get("sha")
    except Exception as exc:
        main_sha = None
        errors.append(f"unable to read main SHA: {exc}")

    evidence["exact_head_authority_current"] = bool(
        isinstance(main_sha, str)
        and len(main_sha) == 40
        and _workflow_success(repository, "ci.yml", main_sha)
        and _workflow_success(repository, "security.yml", main_sha)
    )

    try:
        engine_ref = _gh_json(repository, "/git/ref/heads/engine")
        engine_sha = engine_ref.get("object", {}).get("sha")
    except Exception as exc:
        engine_sha = None
        errors.append(f"unable to read engine SHA: {exc}")
    evidence["engine_trunk_verified"] = bool(
        isinstance(engine_sha, str)
        and len(engine_sha) == 40
        and _workflow_success(repository, "engine-ci.yml", engine_sha)
        and _workflow_success(repository, "security.yml", engine_sha)
    )

    evidence["autonomous_foundation_merged_main"] = bool(
        _foundation_present_on_main(repository)
    )

    verification_endpoint = os.getenv("VERIFICATION_ENGINE_ENDPOINT", "").strip()
    evidence["verification_engine_configured"] = verification_endpoint.startswith(
        ("https://", "http://")
    )
    if not evidence["verification_engine_configured"]:
        errors.append(
            "VERIFICATION_ENGINE_ENDPOINT must be an explicit http(s) URL for autonomous verification"
        )

    evidence["live_control_plane_clean"] = False
    try:
        live = summarize_live(repository)
        evidence["live_control_plane_clean"] = live.get("valid") is True
        if not evidence["live_control_plane_clean"]:
            errors.extend(list(live.get("errors", [])))
    except Exception as exc:
        errors.append(f"live audit failed: {exc}")

    independent_test_groups = {
        "worker_contract_tested": [
            "tests/test_worker_contract.py",
            "tests/test_worker_client.py",
        ],
        "worker_output_independently_validated": [
            "tests/test_worker_apply.py",
            "tests/test_worker_executor.py",
            "tests/test_worker_publisher.py",
            "tests/test_worker_prmgr.py",
        ],
        "end_to_end_dry_run_passed": [
            "tests/test_autonomous_cycle.py",
            "tests/test_worker_dry_run.py",
            "tests/test_autonomy_readiness.py",
        ],
    }
    for gate, targets in independent_test_groups.items():
        command = [sys.executable, "-m", "pytest", "-q", *targets]
        try:
            completed = subprocess.run(
                command,
                cwd=Path(__file__).resolve().parents[2],
                capture_output=True,
                text=True,
                timeout=300,
                check=False,
            )
            evidence[gate] = completed.returncode == 0
            if completed.returncode != 0:
                errors.append(f"{gate} evidence suite failed")
        except (OSError, subprocess.SubprocessError) as exc:
            evidence[gate] = False
            errors.append(f"{gate} evidence could not be collected: {exc}")

    evidence["worker_transport_live"] = False
    worker_url = os.getenv("AUTOMATE_WORKER_URL", "").strip()
    worker_token_value = os.getenv("AUTOMATE_WORKER_TOKEN", "").strip()
    if worker_url and worker_token_value:
        try:
            health = _request_json(
                worker_api_url(worker_url) + "/health",
                token=worker_token(worker_token_value),
                timeout=15.0,
            )
            evidence["worker_transport_live"] = (
                health.get("success") is True
                and health.get("protocol") == "automate.worker.v1"
                and health.get("execution") == "contract_only"
            )
            if not evidence["worker_transport_live"]:
                errors.append("worker health endpoint returned an unexpected protocol")
        except Exception as exc:
            errors.append(f"live worker health check failed: {exc}")
    else:
        errors.append("AUTOMATE_WORKER_URL and AUTOMATE_WORKER_TOKEN are required for live worker health evidence")

    evidence["worker_api_authenticated_bounded"] = False
    evidence["github_lifecycle_exercised"] = False
    try:
        worker_ref = _gh_json(worker_repository, "/git/ref/heads/main")
        worker_sha = worker_ref.get("object", {}).get("sha")
        required_worker_files = (
            "src/worker/auth.ts",
            "src/worker/guard.ts",
            "src/endpoints/worker/jobExecute.ts",
        )
        present = all(
            _github_content_exists(worker_repository, path, "main")
            for path in required_worker_files
        )
        worker_ci = (
            isinstance(worker_sha, str)
            and _workflow_success(worker_repository, "worker-ci.yml", worker_sha)
        )
        evidence["worker_api_authenticated_bounded"] = present and worker_ci
        # Worker repository health is not proof that Automate exercised its own
        # worker -> proposal -> branch -> PR lifecycle.
        evidence["github_lifecycle_exercised"] = _github_lifecycle_exercised(repository)
    except Exception as exc:
        errors.append(f"worker substrate inspection failed: {exc}")

    return {
        "schema_version": "automate.autonomy_readiness.v1",
        "main_sha_observed": main_sha,
        "engine_sha_observed": engine_sha,
        "evidence": evidence,
        "errors": errors,
    }


def auto_readiness(
    repository: str,
    *,
    worker_repository: str = "rynahmed101-sys/chanfana-openapi-template",
) -> dict[str, Any]:
    collected = collect_readiness_evidence(
        repository,
        worker_repository=worker_repository,
    )
    return {**evaluate_readiness(collected["evidence"]), **collected}
