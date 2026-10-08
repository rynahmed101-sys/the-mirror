"""Closed-loop operating mode controller for autonomous development.

The controller is intentionally narrow:
- unfinished canonical work keeps the system in BACKLOG mode;
- only the strict inventory gate selects the next capability;
- once no canonical work remains, the controller can expose DISCOVERY_READY;
- Mirror never decides that the ledger is complete.
"""

from __future__ import annotations

import json
from pathlib import Path

from typing import Any, Literal

from automate.dev.autonomous import run_autonomous_cycle
from automate.dev.inventory import load_inventory, queue_snapshot
from automate.dev.discovery_grant import build_discovery_grant
from automate.dev.worker import build_worker_packet
from automate.dev import failure_recovery
from automate.dev.promotion import (
    PromotionError,
    _gh_json,
    find_worker_handoff,
    inspect_worker_handoff_pr,
    inspect_capability_lifecycle,
    inspect_merged_worker_handoff,
    execute_promotion,
    find_bookkeeping_pr,
    inspect_bookkeeping_pr,
)
from automate.dev.bookkeeping_pr import execute_bookkeeping_promotion

class VerificationError(RuntimeError):
    """Raised when required scientific verification cannot be completed."""


OperatingMode = Literal["BACKLOG", "DISCOVERY_READY", "STOPPED"]


def find_quarantined_worker_handoff(*args: Any, **kwargs: Any) -> dict[str, Any] | None:
    """Dynamic seam for the durable repair-hold inspector."""
    return failure_recovery.find_quarantined_worker_handoff(*args, **kwargs)


def resolve_operating_mode(data: dict[str, Any] | None = None) -> dict[str, Any]:
    inventory = data or load_inventory()
    queue = queue_snapshot(inventory)
    action = queue["next_action"]["action"]

    if action == "none":
        return {
            "schema_version": "automate.operating_mode.v1",
            "mode": "DISCOVERY_READY",
            "reason": "The canonical capability queue contains no unresolved pre-discovery work.",
            "queue": queue,
            "mirror_discovery_allowed": True,
        }

    return {
        "schema_version": "automate.operating_mode.v1",
        "mode": "BACKLOG",
        "reason": "Canonical backlog work still exists; strict ledger execution remains dominant.",
        "queue": queue,
        "mirror_discovery_allowed": False,
    }


def run_control_cycle(
    repository: str,
    *,
    worker_url: str | None = None,
    worker_token: str | None = None,
    execute_worker: bool = False,
    execute_discovery: bool = False,
    local_root=None,
) -> dict[str, Any]:
    control = resolve_operating_mode()
    if control["mode"] == "DISCOVERY_READY":
        grant = build_discovery_grant(
            control,
            correlation_id="ctrl_" + __import__("hashlib").sha256(
                json.dumps(control["queue"], sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest()[:24],
        )
        if not execute_discovery:
            return {**control, "discovery_grant": grant, "dispatch_allowed": False}
        import os
        enabled = os.getenv("AUTOMATE_MIRROR_DISCOVERY_ENABLED", "").strip().lower() in {"1", "true", "yes"}
        if not enabled:
            return {
                **control,
                "discovery_grant": grant,
                "dispatch_allowed": False,
                "status": "mirror_discovery_disabled_by_governance",
            }
        try:
            from automate.dev.discovery_job import (
                build_discovery_job,
                dispatch_discovery_job,
                read_discovery_job,
                DiscoveryJobError,
            )
            if not worker_url or not worker_token:
                raise DiscoveryJobError("durable worker transport credentials are required for Mirror discovery")
            action_cycle_id = grant["correlation_id"]
            envelope = build_discovery_job(
                grant=grant,
                action_cycle_id=action_cycle_id,
                mirror_endpoint=__import__("os").getenv("MIRROR_AUTONOMOUS_DISCOVERY_ENDPOINT", ""),
            )
            dispatch = dispatch_discovery_job(
                envelope,
                worker_url=worker_url,
                worker_token=worker_token,
            )
            job_id = str(dispatch.get("queued", {}).get("jobId") or "")
            if not job_id:
                raise DiscoveryJobError("Chanfana returned no durable discovery job ID")
            durable = read_discovery_job(
                job_id,
                worker_url=worker_url,
                worker_token=worker_token,
            )
            job = durable.get("job", {})
            if job.get("state") != "succeeded":
                return {
                    **control,
                    "discovery_grant": grant,
                    "dispatch_allowed": False,
                    "status": "mirror_discovery_job_not_complete",
                    "discovery_job": durable,
                }
            result = job.get("result")
            if not isinstance(result, dict):
                raise DiscoveryJobError("durable discovery job result is not an object")
        except DiscoveryJobError as exc:
            return {
                **control,
                "discovery_grant": grant,
                "dispatch_allowed": False,
                "status": "mirror_discovery_dispatch_blocked",
                "error": str(exc),
            }
        from automate.dev.discovery import triage_mirror_autopilot_result
        from automate.dev.future_capability import build_future_capability_proposal

        triage = triage_mirror_autopilot_result(result.get("result", result))
        if len(triage) > 1:
            return {
                **control,
                "discovery_grant": grant,
                "dispatch_allowed": False,
                "status": "mirror_discovery_protocol_violation",
                "discovery": result,
                "error": "Mirror returned more than one candidate in a one-candidate discovery cycle.",
            }

        future_capability = None
        future_capability_persistence = None
        if triage and triage[0]["status"] == "READY_FOR_INVESTIGATION":
            proposals = __import__("automate.dev.discovery", fromlist=["extract_candidate_proposals"]).extract_candidate_proposals(
                result.get("result", result)
            )
            if proposals:
                future_capability = build_future_capability_proposal(
                    proposals[0],
                    triage[0],
                )
                if worker_url and worker_token:
                    try:
                        from automate.dev.future_capability_learning import persist_future_capability
                        future_capability_persistence = persist_future_capability(
                            future_capability,
                            source_revision=None,
                            correlation_id=grant["correlation_id"],
                            url=worker_url,
                            token=worker_token,
                        )
                    except Exception as exc:
                        future_capability_persistence = {
                            "status": "persistence_blocked",
                            "error": str(exc),
                        }

        return {
            **control,
            "discovery_grant": grant,
            "dispatch_allowed": True,
            "status": "mirror_discovery_dispatched",
            "discovery": result,
            "candidate_triage": triage,
            "future_capability": future_capability,
            "future_capability_persistence": future_capability_persistence,
            "canonical_mutation_performed": False,
        }
    if control["mode"] != "BACKLOG":
        return control

    action = control["queue"]["next_action"]
    if action["action"] != "implement":
        return {
            **control,
            "status": "awaiting_reconciliation_or_manual_repair",
            "dispatch_allowed": False,
        }

    capability_id = action["capability_id"]

    try:
        ref_payload = _gh_json(repository, "/git/ref/heads/main")
        current_main_sha = str(ref_payload.get("object", {}).get("sha") or "")
    except PromotionError as exc:
        return {
            **control,
            "status": "main_sha_unavailable",
            "error": str(exc),
            "dispatch_allowed": False,
        }

    if len(current_main_sha) != 40:
        return {**control, "status": "main_sha_unavailable", "dispatch_allowed": False}

    # First-class handoff check: an existing worker PR is durable work.
    # Never dispatch a second job for the same canonical capability while that
    # handoff exists, even if inventory bookkeeping has not caught up yet.
    # Detect a previously merged worker handoff even if canonical inventory
    # bookkeeping has not yet caught up.
    try:
        merged_handoff = inspect_merged_worker_handoff(
            repository,
            capability_id=capability_id,
            current_main_sha=current_main_sha,
        )
    except PromotionError as exc:
        return {
            **control,
            "status": "merged_handoff_inspection_error",
            "error": str(exc),
            "dispatch_allowed": False,
        }

    if merged_handoff is not None:
        post = merged_handoff.get("post_merge", {})
        if post.get("state") == "BLOCKED_STALE_MAIN":
            return {
                **control,
                "status": "post_merge_reconciliation_required",
                "dispatch_allowed": False,
                "lifecycle": merged_handoff,
            }
        if post.get("state") not in {"BLOCKED_STALE_MAIN", "BOOKKEEPING_READY"}:
            return {
                **control,
                "status": "post_merge_exact_head_verification_pending",
                "dispatch_allowed": False,
                "lifecycle": merged_handoff,
                "verification": post,
            }

        if post.get("state") == "BOOKKEEPING_READY":
            import os
            auto_bookkeep = os.getenv("AUTOMATE_AUTO_BOOKKEEP", "").strip().lower() in {"1", "true", "yes"}
            bookkeeping_pr = inspect_bookkeeping_pr(
                repository,
                capability_id=capability_id,
                merge_sha=current_main_sha,
                require_review=not auto_bookkeep,
            )
            if bookkeeping_pr and bookkeeping_pr.get("state") == "READY_TO_MERGE":
                import os
                should_execute = os.getenv("AUTOMATE_AUTO_BOOKKEEP", "").strip().lower() in {"1", "true", "yes"}
                bookkeeping_pr["promotion_execution"] = execute_bookkeeping_promotion(
                    repository,
                    int(bookkeeping_pr["pr"]["number"]),
                    current_main_sha=current_main_sha,
                    execute=should_execute,
                    verification_result=result,
                )
                return {
                    **control,
                    "status": "bookkeeping_promotion_attempted",
                    "dispatch_allowed": False,
                    "lifecycle": merged_handoff,
                    "bookkeeping": bookkeeping_pr,
                }

            if bookkeeping_pr and bookkeeping_pr.get("state") == "STALE_BOOKKEEPING_PR":
                return {
                    **control,
                    "status": "bookkeeping_reconciliation_required",
                    "dispatch_allowed": False,
                    "lifecycle": merged_handoff,
                    "bookkeeping": bookkeeping_pr,
                }

            if bookkeeping_pr and bookkeeping_pr.get("state") in {"BLOCKED", "BLOCKED_BOOKKEEPING_SCOPE"}:
                return {
                    **control,
                    "status": "bookkeeping_blocked",
                    "dispatch_allowed": False,
                    "lifecycle": merged_handoff,
                    "bookkeeping": bookkeeping_pr,
                }

            if local_root is None:
                return {
                    **control,
                    "status": "bookkeeping_ready",
                    "dispatch_allowed": False,
                    "lifecycle": merged_handoff,
                    "next_step": "provide the canonical checkout root to publish the bookkeeping PR",
                }
            try:
                from automate.dev.bookkeeping import build_bookkeeping_plan
                from automate.dev.bookkeeping_pr import create_bookkeeping_pr

                root = Path(local_root)
                inventory_text = __import__("subprocess").run(
                    ["git", "show", f"{current_main_sha}:docs/CAPABILITY_INVENTORY.json"],
                    cwd=root,
                    capture_output=True,
                    text=True,
                    check=True,
                ).stdout
                ledger_text = __import__("subprocess").run(
                    ["git", "show", f"{current_main_sha}:docs/PROJECT_PHASE_LEDGER.md"],
                    cwd=root,
                    capture_output=True,
                    text=True,
                    check=True,
                ).stdout
                plan = build_bookkeeping_plan(
                    json.loads(inventory_text),
                    ledger_text,
                    capability_id=capability_id,
                    merge_sha=current_main_sha,
                    exact_head_ci_run=int(post.get("ci_run_id") or 0),
                    security_run=int(post.get("security_run_id") or 0),
                    merged_pr_number=int(merged_handoff["pr_number"]),
                )
                bookkeeping = create_bookkeeping_pr(
                    root,
                    repository,
                    capability_id=capability_id,
                    merge_sha=current_main_sha,
                    merged_pr_number=int(merged_handoff["pr_number"]),
                    exact_head_ci_run=int(post.get("ci_run_id") or 0),
                    security_run=int(post.get("security_run_id") or 0),
                    plan=plan,
                )
                return {
                    **control,
                    "status": "bookkeeping_pr_open",
                    "dispatch_allowed": False,
                    "lifecycle": merged_handoff,
                    "bookkeeping": bookkeeping,
                }
            except Exception as exc:
                return {
                    **control,
                    "status": "bookkeeping_blocked",
                    "dispatch_allowed": False,
                    "lifecycle": merged_handoff,
                    "error": str(exc),
                }

    # Durable repair holds take precedence over any stale/original worker handoff.
    # A quarantined capability must never be duplicated merely because the original
    # PR is still discoverable in GitHub while recovery is being performed.
    try:
        repair_hold = find_quarantined_worker_handoff(
            repository,
            capability_id=capability_id,
        )
    except Exception as exc:
        return {
            **control,
            "status": "repair_hold_inspection_blocked",
            "dispatch_allowed": False,
            "error": str(exc),
        }
    if repair_hold is not None:
        return {
            **control,
            "status": "repair_hold",
            "dispatch_allowed": False,
            "repair_hold": repair_hold,
            "next_step": "wait for or dispatch the next automatic repair worker handoff; do not start a duplicate original worker task",
        }

    try:
        handoff = find_worker_handoff(
            repository,
            capability_id=capability_id,
            current_main_sha=current_main_sha,
        )
    except PromotionError as exc:
        return {
            **control,
            "status": "worker_handoff_error",
            "error": str(exc),
            "dispatch_allowed": False,
        }

    if handoff is not None:
        head_sha = str(
            handoff.get("head_sha")
            or handoff.get("pr", {}).get("head", {}).get("sha")
            or handoff.get("pr", {}).get("head_sha")
            or ""
        )
        recovery = None
        if head_sha:
            try:
                from automate.dev.failure_recovery import (
                    exact_head_recovery_state,
                    diagnose_worker_failure,
                    quarantine_worker_pr,
                    rerun_failed_workflows,
                )
                recovery = exact_head_recovery_state(repository, head_sha)
            except Exception as exc:
                return {
                    **control,
                    "status": "worker_recovery_inspection_blocked",
                    "error": str(exc),
                    "dispatch_allowed": False,
                    "lifecycle": handoff,
                }

        if recovery is not None and recovery["state"] == "retryable_failure":
            retry = rerun_failed_workflows(repository, list(recovery["retryable"]))
            return {
                **control,
                "status": "worker_verification_retry_requested",
                "dispatch_allowed": False,
                "lifecycle": handoff,
                "recovery": recovery,
                "retry": retry,
            }

        if recovery is not None and recovery["state"] == "pending":
            return {
                **control,
                "status": "worker_verification_pending",
                "dispatch_allowed": False,
                "lifecycle": handoff,
                "recovery": recovery,
            }

        if recovery is not None and recovery["state"] == "repeated_failure":
            pr_number = handoff.get("number") or handoff.get("pr", {}).get("number")
            failures = list(recovery["failures"])
            if not isinstance(pr_number, int):
                return {
                    **control,
                    "status": "worker_recovery_blocked",
                    "error": "repeated failure has no valid worker PR number",
                    "dispatch_allowed": False,
                    "lifecycle": handoff,
                    "recovery": recovery,
                }
            diagnosis = diagnose_worker_failure(repository, pr_number, failures)
            quarantine = quarantine_worker_pr(repository, pr_number, failures)
            if quarantine.get("state") != "quarantined":
                return {
                    **control,
                    "status": "worker_quarantine_failed",
                    "dispatch_allowed": False,
                    "lifecycle": handoff,
                    "recovery": recovery,
                    "diagnosis": diagnosis,
                    "quarantine": quarantine,
                }
            from automate.dev.failure_recovery import next_recovery_attempt, build_repair_hold
            previous_branch = str(
                handoff.get("branch")
                or handoff.get("pr", {}).get("head", {}).get("ref")
                or handoff.get("pr", {}).get("branch")
                or ""
            )
            recovery_attempt = next_recovery_attempt(previous_branch)
            context_notes = [
                "AUTONOMOUS_RECOVERY: prior worker proposal was quarantined after repeated exact-head failures.",
                *diagnosis["notes"],
            ]
            if not worker_url or not worker_token:
                return {
                    **control,
                    "status": "repair_hold",
                    "dispatch_allowed": False,
                    "lifecycle": handoff,
                    "recovery": recovery,
                    "diagnosis": diagnosis,
                    "quarantine": quarantine,
                    "repair_context": context_notes,
                    "repair_hold": build_repair_hold(
                        capability_id=capability_id,
                        source_sha=current_main_sha,
                        recovery_attempt=recovery_attempt,
                        reason="worker transport credentials are unavailable; automatic rectification must remain on hold instead of re-dispatching the original task",
                    ),
                }
            try:
                repair_packet = build_worker_packet(
                    capability_id,
                    repository=repository,
                    base_sha_claim=current_main_sha,
                    development_branch="main",
                    context_notes=context_notes,
                    recovery_attempt=recovery_attempt,
                )
                dispatch = __import__("automate.dev.worker_client", fromlist=["dispatch_worker"]).dispatch_worker(
                    repair_packet,
                    url=worker_url,
                    token=worker_token,
                    execute=execute_worker,
                )
            except Exception as exc:
                return {
                    **control,
                    "status": "worker_repair_dispatch_blocked",
                    "dispatch_allowed": False,
                    "lifecycle": handoff,
                    "recovery": recovery,
                    "diagnosis": diagnosis,
                    "quarantine": quarantine,
                    "repair_context": context_notes,
                    "error": str(exc),
                }
            return {
                **control,
                "status": "repair_hold",
                "dispatch_allowed": False,
                "lifecycle": handoff,
                "recovery": recovery,
                "diagnosis": diagnosis,
                "quarantine": quarantine,
                "repair_context": context_notes,
                "repair_hold": build_repair_hold(
                    capability_id=capability_id,
                    source_sha=current_main_sha,
                    recovery_attempt=recovery_attempt,
                    reason="repeated exact-head verification failure; automatic rectification dispatched as a distinct repair generation",
                    repair_dispatch=dispatch,
                ),
                "dispatch": dispatch,
            }

        verification = None
        require_verification = True
        if require_verification:
            head_sha = str(
                handoff.get("head_sha")
                or handoff.get("pr", {}).get("head", {}).get("sha")
                or handoff.get("pr", {}).get("head_sha")
                or ""
            )
            branch_name = str(
                handoff.get("branch")
                or handoff.get("pr", {}).get("head", {}).get("ref")
                or handoff.get("pr", {}).get("branch")
                or ""
            )
            try:
                from automate.dev.verification_job import (
                    build_verification_job,
                    dispatch_verification_job,
                    read_verification_result,
                )
                action_cycle_id = "ctrl_" + __import__("hashlib").sha256(
                    (capability_id + "\0" + head_sha).encode("utf-8")
                ).hexdigest()[:32]
                envelope = build_verification_job(
                    capability_id=capability_id,
                    repository=repository,
                    revision=head_sha,
                    branch=branch_name,
                    action_cycle_id=action_cycle_id,
                    verifier_endpoint=__import__("os").getenv("VERIFICATION_ENGINE_ENDPOINT", ""),
                    parent_ids=[str(handoff.get("request_id") or "")],
                    workflow_kind="mirror_verification",
                    payload={"purpose": "pre-promotion scientific verification"},
                )
                if not worker_url or not worker_token:
                    raise VerificationError("worker transport credentials are required for verification")
                dispatched = dispatch_verification_job(
                    envelope,
                    worker_url=worker_url,
                    worker_token=worker_token,
                    execute=True,
                )
                queued = dispatched.get("queued", {})
                job_id = str(queued.get("jobId") or "")
                if not job_id:
                    raise VerificationError("verification dispatch returned no durable job ID")
                verification = read_verification_result(
                    job_id,
                    worker_url=worker_url,
                    worker_token=worker_token,
                )
                job = verification.get("job", {})
                result = job.get("result")
                verification["gate"] = {
                    "required": True,
                    "job_id": job_id,
                    "state": job.get("state"),
                    "accepted": (
                        job.get("state") == "succeeded"
                        and isinstance(result, dict)
                        and result.get("authority") == "EVIDENCE_ONLY"
                        and result.get("source_revision") == head_sha
                        and result.get("evidence_state") in {"VERIFIED", "REPRODUCED", "IMPLEMENTATION_VERIFIED"}
                    ),
                }
            except Exception as exc:
                verification = {
                    "gate": {"required": True, "accepted": False},
                    "error": str(exc),
                }

        if verification and not verification.get("gate", {}).get("accepted", False):
            return {
                **control,
                "status": "verification_blocked",
                "dispatch_allowed": False,
                "verification": verification,
                "lifecycle": handoff,
            }

        try:
            packet = build_worker_packet(
                capability_id,
                repository=repository,
                base_sha_claim=current_main_sha,
                development_branch="main",
            )["packet"]
            lifecycle = inspect_worker_handoff_pr(
                repository,
                capability_id=capability_id,
                packet=packet,
                handoff=handoff,
                current_main_sha=current_main_sha,
                verification_result=result,
            )
            promotion = lifecycle.get("promotion", {})
            if promotion.get("state") == "READY_TO_MERGE":
                import os
                should_execute = os.getenv("AUTOMATE_AUTO_PROMOTE", "").strip().lower() in {"1", "true", "yes"}
                lifecycle["promotion_execution"] = execute_promotion(
                    repository,
                    int(lifecycle["pr"]["number"]),
                    current_main_sha=current_main_sha,
                    execute=should_execute,
                    verification_result=result,
                )
        except PromotionError as exc:
            return {
                **control,
                "status": "worker_handoff_blocked",
                "error": str(exc),
                "dispatch_allowed": False,
            }

        return {
            **control,
            "status": (
                "promotion_ready"
                if lifecycle.get("promotion", {}).get("state") == "READY_TO_MERGE"
                else lifecycle.get("promotion_execution", {}).get("execution", lifecycle.get("state", "worker_handoff_active")).lower()
                if isinstance(lifecycle.get("promotion_execution"), dict)
                else lifecycle.get("state", "worker_handoff_active").lower()
            ),
            "dispatch_allowed": False,
            "lifecycle": lifecycle,
        }

    try:
        lifecycle = inspect_capability_lifecycle(
            repository,
            capability_id=capability_id,
            current_main_sha=current_main_sha,
        )
    except PromotionError as exc:
        return {
            **control,
            "status": "promotion_lifecycle_error",
            "error": str(exc),
            "dispatch_allowed": False,
        }

    if lifecycle["state"] == "IMPLEMENTATION_PR":
        evaluation = lifecycle["promotion"]
        return {
            **control,
            "status": "promotion_ready" if evaluation["state"] == "READY_TO_MERGE" else "promotion_blocked",
            "dispatch_allowed": False,
            "lifecycle": lifecycle,
        }

    if lifecycle["state"] == "POST_MERGE":
        return {
            **control,
            "status": "post_merge_verification",
            "dispatch_allowed": False,
            "lifecycle": lifecycle,
        }

    result = run_autonomous_cycle(
        repository,
        worker_url=worker_url,
        worker_token=worker_token,
        execute_worker=execute_worker,
        local_root=local_root,
        mode="backlog",
        auto_publish=False,
    )

    lifecycle = None
    decision = result.get("decision", {})
    packet = decision.get("worker_packet", {}).get("packet", {})
    commit = result.get("commit", {})
    base_sha = packet.get("repository", {}).get("base_sha_claim")

    if (
        isinstance(commit, dict)
        and commit.get("status") == "committed"
        and isinstance(base_sha, str)
        and local_root is not None
    ):
        from automate.dev.prmgr import create_worker_pr
        from automate.dev.publisher import push_worker_branch

        try:
            push_worker_branch(Path(local_root), branch_name=str(commit["branch"]))
            handoff = create_worker_pr(
                repository,
                branch=str(commit["branch"]),
                capability_id=capability_id,
                title=f"feat: implement {packet['capability']['name']}",
                base_sha=base_sha,
                test_result=commit.get("tests") or {},
                worker_request_id=str(packet["request_id"]),
            )
            lifecycle = {
                "state": "IMPLEMENTATION_PR",
                "capability_id": capability_id,
                "pr": handoff,
                "worker_commit_sha": commit.get("commit_sha"),
            }
        except Exception as exc:
            lifecycle = {
                "state": "WORKER_HANDOFF_BLOCKED",
                "capability_id": capability_id,
                "error": str(exc),
            }
    elif commit.get("status") == "committed":
        lifecycle = {
            "state": "WORKER_COMMITTED_REQUIRES_PUBLISH",
            "capability_id": capability_id,
            "worker_commit_sha": commit.get("commit_sha"),
        }

    handoff_open = isinstance(lifecycle, dict) and lifecycle.get("state") == "IMPLEMENTATION_PR"
    return {
        **control,
        "status": (
            "worker_handoff_open"
            if handoff_open
            else "backlog_cycle_completed"
        ),
        "dispatch_allowed": not handoff_open,
        "cycle": result,
        "lifecycle": lifecycle,
    }
