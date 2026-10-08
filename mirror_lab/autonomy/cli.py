"""CLI commands for the development control plane."""
from __future__ import annotations

import json
from pathlib import Path
import click

from automate.dev.inventory import (
    InventoryError,
    active_references,
    get_capability,
    load_inventory,
    next_action,
    next_unclaimed,
    packet as capability_packet,
    queue_snapshot,
    validate_inventory,
)
from automate.dev.worker import build_worker_packet, worker_packet_json


@click.group(name="capability")
def capability() -> None:
    """Inspect capability ownership, reconciliation and verification state."""


@capability.command("list")
@click.option("--stage", default=None)
@click.option("--state", default=None)
@click.option("--json", "as_json", is_flag=True)
def list_capabilities(stage: str | None, state: str | None, as_json: bool) -> None:
    data = load_inventory()
    records = [
        item for item in data["capabilities"]
        if (stage is None or item["stage"] == stage)
        and (state is None or item["implementation_state"] == state)
    ]
    if as_json:
        click.echo(json.dumps(records, indent=2))
    else:
        for item in records:
            click.echo(f'{item["stage"]:>3}  {item["implementation_state"]:<24}  {item["id"]}')


@capability.command("status")
@click.argument("capability_id")
@click.option("--json", "as_json", is_flag=True)
def status(capability_id: str, as_json: bool) -> None:
    try:
        item = get_capability(capability_id)
    except InventoryError as exc:
        raise click.ClickException(str(exc)) from exc
    if as_json:
        click.echo(json.dumps(item, indent=2))
        return
    click.echo(f'{item["id"]}: {item["implementation_state"]}')
    click.echo(f'{item["name"]}')
    click.echo(f'authority: {item["authority"]["kind"]} / {item["authority"]["ref"]}')
    for ref in item["references"]:
        if ref.get("type") == "pr":
            click.echo(f'PR #{ref.get("number")}: {ref.get("state")} {ref.get("branch", "")}'.rstrip())


@capability.command("next")
@click.option("--json", "as_json", is_flag=True)
def next_command(as_json: bool) -> None:
    data = load_inventory()
    candidate = next_unclaimed(data)
    payload = {
        "next_action": next_action(data),
        "next_unclaimed": candidate["id"] if candidate else None,
    }
    if as_json:
        click.echo(json.dumps(payload, indent=2))
    else:
        click.echo(json.dumps(payload["next_action"], indent=2))


@capability.command("refs")
@click.option("--json", "as_json", is_flag=True)
def refs(as_json: bool) -> None:
    records = active_references(load_inventory())
    if as_json:
        click.echo(json.dumps(records, indent=2))
    else:
        for ref in records:
            click.echo(f'PR #{ref.get("number")}: {ref["capability_id"]} / {ref.get("branch", "")}')


@capability.command("validate")
@click.option("--json", "as_json", is_flag=True)
def validate(as_json: bool) -> None:
    data = json.loads(__import__("pathlib").Path(
        __import__("automate.dev.inventory", fromlist=["INVENTORY_PATH"]).INVENTORY_PATH
    ).read_text(encoding="utf-8"))
    errors = validate_inventory(data)
    payload = {"valid": not errors, "errors": errors}
    click.echo(json.dumps(payload, indent=2) if as_json else ("VALID" if not errors else "\n".join(errors)))
    if errors:
        raise click.exceptions.Exit(1)


@capability.command("packet")
@click.argument("capability_id")
@click.option("--json", "as_json", is_flag=True)
def packet_command(capability_id: str, as_json: bool) -> None:
    """Print the machine-readable implementation contract for one capability."""
    try:
        payload = capability_packet(capability_id)
    except InventoryError as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(json.dumps(payload, indent=2) if as_json else json.dumps(payload, indent=2))


@capability.command("worker-packet")
@click.argument("capability_id")
@click.option("--repo", "repository", default="rynahmed101-sys/automate", show_default=True)
@click.option("--base-sha", default=None, help="Live main SHA observed by the supervisor.")
@click.option("--json", "as_json", is_flag=True)
def worker_packet_command(capability_id: str, repository: str, base_sha: str | None, as_json: bool) -> None:
    """Render a bounded autonomous implementation packet for a claimable capability."""
    try:
        payload = build_worker_packet(
            capability_id,
            repository=repository,
            base_sha_claim=base_sha,
        )
    except InventoryError as exc:
        raise click.ClickException(str(exc)) from exc
    output = json.dumps(payload, indent=2, sort_keys=True)
    click.echo(output)


@capability.command("guard")
@click.option("--branch", required=True, help="Development branch being checked.")
@click.option("--base", default=None, help="Base ref/commit used for changed-file discovery.")
@click.option("--head", default="HEAD", help="Head ref/commit.")
@click.option("--changed-file", multiple=True, help="Explicit changed-file path; repeatable.")
def guard_command(branch: str, base: str | None, head: str, changed_file: tuple[str, ...]) -> None:
    """Fail closed when a capability branch crosses shared integration boundaries."""
    from automate.dev.guard import changed_files, validate_branch_scope
    files = list(changed_file) if changed_file else changed_files(base, head)
    errors = validate_branch_scope(branch, files)
    if errors:
        for error in errors:
            click.echo(f"ERROR: {error}", err=True)
        raise click.exceptions.Exit(1)
    click.echo(f"BRANCH_SCOPE_OK: {branch} ({len(files)} changed files)")


@capability.command("queue")
@click.option("--json", "as_json", is_flag=True)
def queue_command(as_json: bool) -> None:
    """Print the complete deterministic capability queue state."""
    payload = queue_snapshot(load_inventory())
    click.echo(json.dumps(payload, indent=2) if as_json else json.dumps(payload, indent=2))


@capability.command("audit-live")
@click.option("--repo", "repository", required=True, help="GitHub repository in owner/name form.")
@click.option("--json", "as_json", is_flag=True)
def audit_live_command(repository: str, as_json: bool) -> None:
    """Cross-check inventory references against live open GitHub PRs."""
    from automate.dev.live import LiveAuditError, summarize_live
    try:
        payload = summarize_live(repository)
    except LiveAuditError as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(json.dumps(payload, indent=2) if as_json else ("VALID" if payload["valid"] else "\n".join(payload["errors"])))
    if not payload["valid"]:
        raise click.exceptions.Exit(1)

@capability.command("supervise")
@click.option("--repo", "repository", required=True, help="GitHub repository in owner/name form.")
@click.option("--base-sha", default=None, help="Observed main SHA to bind into the worker packet.")
@click.option("--skip-live", is_flag=True, help="Skip the live GitHub audit. This can never produce a dispatchable decision.")
@click.option("--json", "as_json", is_flag=True)
def supervise_command(repository: str, base_sha: str | None, skip_live: bool, as_json: bool) -> None:
    """Make one deterministic worker-dispatch decision from inventory and live state."""
    from automate.dev.supervisor import supervisor_snapshot
    try:
        payload = supervisor_snapshot(
            repository,
            live=not skip_live,
            base_sha=base_sha,
        )
    except InventoryError as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(json.dumps(payload, indent=2) if as_json else json.dumps(payload, indent=2))
    if payload["action"] == "stop":
        raise click.exceptions.Exit(1)

@capability.command("worker-run")
@click.option("--repo", "repository", required=True, help="GitHub repository in owner/name form.")
@click.option("--worker-url", default=None, help="Worker API base URL. Defaults to AUTOMATE_WORKER_URL.")
@click.option("--worker-token", default=None, help="Worker API token. Defaults to AUTOMATE_WORKER_TOKEN.")
@click.option("--execute", is_flag=True, help="Also ask the worker to execute the queued job.")
@click.option("--base-sha", default=None, help="Observed main SHA to bind into the worker packet.")
@click.option("--json", "as_json", is_flag=True)
def worker_run_command(
    repository: str,
    worker_url: str | None,
    worker_token: str | None,
    execute: bool,
    base_sha: str | None,
    as_json: bool,
) -> None:
    """Run one supervisor-approved worker dispatch without merging anything."""
    from automate.dev.supervisor import supervisor_snapshot
    from automate.dev.worker_client import WorkerTransportError, dispatch_worker

    try:
        decision = supervisor_snapshot(
            repository,
            live=True,
            base_sha=base_sha,
        )
        if not decision["can_dispatch"]:
            click.echo(json.dumps(decision, indent=2))
            raise click.exceptions.Exit(1)
        result = dispatch_worker(
            decision["worker_packet"],
            url=worker_url,
            token=worker_token,
            execute=execute,
        )
    except (InventoryError, WorkerTransportError) as exc:
        raise click.ClickException(str(exc)) from exc

    payload = {
        "decision": decision,
        "dispatch": result,
    }
    click.echo(json.dumps(payload, indent=2))

@capability.command("worker-status")
@click.argument("job_id")
@click.option("--worker-url", default=None, help="Worker API base URL. Defaults to AUTOMATE_WORKER_URL.")
@click.option("--worker-token", default=None, help="Worker API token. Defaults to AUTOMATE_WORKER_TOKEN.")
def worker_status_command(job_id: str, worker_url: str | None, worker_token: str | None) -> None:
    """Read a durable worker job including elapsed time, remaining time and ETA."""
    from automate.dev.worker_client import WorkerTransportError, read_worker_job
    try:
        payload = read_worker_job(job_id, url=worker_url, token=worker_token)
    except WorkerTransportError as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(json.dumps(payload, indent=2))


@capability.command("control-cycle")
@click.option("--repo", "repository", required=True, help="GitHub repository in owner/name form.")
@click.option("--worker-url", default=None, help="Chanfana worker API base URL.")
@click.option("--worker-token", default=None, help="Chanfana worker API token.")
@click.option("--execute-worker", is_flag=True, help="Submit and execute the worker job; otherwise queue only.")
@click.option("--execute-discovery", is_flag=True, help="Dispatch a bounded idle-discovery grant to Mirror; separately governance-gated.")
@click.option("--local-root", type=click.Path(path_type=Path, exists=True, file_okay=False), default=None, help="Canonical checkout used to publish validated worker commits.")
@click.option("--json", "as_json", is_flag=True)
def control_cycle_command(
    repository: str,
    worker_url: str | None,
    worker_token: str | None,
    execute_worker: bool,
    execute_discovery: bool,
    local_root: Path | None,
    as_json: bool,
) -> None:
    """Run exactly one bounded backlog/discovery control cycle."""
    from automate.dev.control_cycle import run_control_cycle
    try:
        payload = run_control_cycle(
            repository,
            worker_url=worker_url,
            worker_token=worker_token,
            execute_worker=execute_worker,
            execute_discovery=execute_discovery,
            local_root=local_root,
        )
    except Exception as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(json.dumps(payload, indent=2))
    if payload.get("mode") == "STOPPED" or payload.get("status") == "awaiting_reconciliation_or_manual_repair":
        raise click.exceptions.Exit(1)


@capability.command("promotion-inspect")
@click.option("--repo", "repository", required=True, help="GitHub repository in owner/name form.")
@click.option("--pr", "pr_number", type=int, required=True, help="Canonical capability PR number.")
@click.option("--main-sha", default=None, help="Exact current main SHA. When omitted, read live GitHub state.")
@click.option("--require-review", is_flag=True, help="Require an explicitly approved review.")
@click.option("--json", "as_json", is_flag=True)
def promotion_inspect_command(
    repository: str,
    pr_number: int,
    main_sha: str | None,
    require_review: bool,
    as_json: bool,
) -> None:
    """Evaluate promotion gates without merging."""
    from automate.dev.promotion import PromotionError, _gh_json, inspect_promotion
    if main_sha is None:
        try:
            ref = _gh_json(repository, "/git/ref/heads/main")
            main_sha = ref.get("object", {}).get("sha")
        except PromotionError as exc:
            raise click.ClickException(str(exc)) from exc
    if not isinstance(main_sha, str) or len(main_sha) != 40:
        raise click.ClickException("current main SHA is unavailable or malformed")
    try:
        payload = inspect_promotion(
            repository,
            pr_number,
            current_main_sha=main_sha,
            require_review=require_review,
        )
    except (PromotionError, InventoryError) as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(json.dumps(payload, indent=2))
    if payload["state"] != "READY_TO_MERGE":
        raise click.exceptions.Exit(1)


@capability.command("promotion-execute")
@click.option("--repo", "repository", required=True, help="GitHub repository in owner/name form.")
@click.option("--pr", "pr_number", type=int, required=True, help="Canonical capability PR number.")
@click.option("--main-sha", default=None, help="Exact current main SHA. When omitted, read live GitHub state.")
@click.option("--execute", is_flag=True, help="Actually request the guarded GitHub merge.")
@click.option("--require-review", is_flag=True, help="Require an explicitly approved review.")
@click.option("--json", "as_json", is_flag=True)
def promotion_execute_command(
    repository: str,
    pr_number: int,
    main_sha: str | None,
    execute: bool,
    require_review: bool,
    as_json: bool,
) -> None:
    """Run one evidence-gated promotion attempt; default is a dry run."""
    from automate.dev.promotion import PromotionError, _gh_json, execute_promotion
    if main_sha is None:
        try:
            ref = _gh_json(repository, "/git/ref/heads/main")
            main_sha = ref.get("object", {}).get("sha")
        except PromotionError as exc:
            raise click.ClickException(str(exc)) from exc
    if not isinstance(main_sha, str) or len(main_sha) != 40:
        raise click.ClickException("current main SHA is unavailable or malformed")
    try:
        payload = execute_promotion(
            repository,
            pr_number,
            current_main_sha=main_sha,
            execute=execute,
            require_review=require_review,
        )
    except (PromotionError, InventoryError) as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(json.dumps(payload, indent=2))
    if payload.get("execution") in {"not_ready", "blocked_by_governance"}:
        raise click.exceptions.Exit(1)

@capability.command("autonomous-cycle")
@click.option("--repo", "repository", required=True, help="GitHub repository in owner/name form.")
@click.option("--worker-url", default=None, help="Worker API base URL. Defaults to AUTOMATE_WORKER_URL.")
@click.option("--worker-token", default=None, help="Worker API token. Defaults to AUTOMATE_WORKER_TOKEN.")
@click.option("--execute-worker", is_flag=True, help="Ask the worker to execute the AI attempt after queueing.")
@click.option("--local-root", type=click.Path(path_type=Path, exists=True, file_okay=False), default=None)
@click.option("--json", "as_json", is_flag=True)
def autonomous_cycle_command(
    repository: str,
    worker_url: str | None,
    worker_token: str | None,
    execute_worker: bool,
    local_root: Path | None,
    as_json: bool,
) -> None:
    """Run one bounded autonomous development cycle."""
    from automate.dev.autonomous import AutonomousCycleError, run_autonomous_cycle
    try:
        payload = run_autonomous_cycle(
            repository,
            worker_url=worker_url,
            worker_token=worker_token,
            execute_worker=execute_worker,
            local_root=local_root,
        )
    except AutonomousCycleError as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(json.dumps(payload, indent=2))

@capability.command("autonomous-readiness")
@click.option("--auto", "automatic", is_flag=True, help="Collect readiness evidence from the live repository and Actions state.")
@click.option("--worker-contract-tested", is_flag=True, hidden=True)
@click.option("--worker-api-authenticated-bounded", is_flag=True, hidden=True)
@click.option("--worker-transport-live", is_flag=True, hidden=True)
@click.option("--worker-output-independently-validated", is_flag=True, hidden=True)
@click.option("--github-lifecycle-exercised", is_flag=True, hidden=True)
@click.option("--live-control-plane-clean", is_flag=True, hidden=True)
@click.option("--exact-head-authority-current", is_flag=True, hidden=True)
@click.option("--end-to-end-dry-run-passed", is_flag=True, hidden=True)
@click.option("--json", "as_json", is_flag=True)
def autonomous_readiness_command(
    automatic: bool,
    worker_contract_tested: bool,
    worker_api_authenticated_bounded: bool,
    worker_transport_live: bool,
    worker_output_independently_validated: bool,
    github_lifecycle_exercised: bool,
    live_control_plane_clean: bool,
    exact_head_authority_current: bool,
    end_to_end_dry_run_passed: bool,
    as_json: bool,
) -> None:
    """Evaluate the fail-closed autonomous worker activation gates."""
    from automate.dev.readiness import auto_readiness, evaluate_readiness
    if automatic:
        try:
            payload = auto_readiness("rynahmed101-sys/automate")
        except Exception as exc:
            raise click.ClickException(str(exc)) from exc
    else:
        payload = evaluate_readiness({
            "worker_contract_tested": worker_contract_tested,
            "worker_api_authenticated_bounded": worker_api_authenticated_bounded,
            "worker_transport_live": worker_transport_live,
            "worker_output_independently_validated": worker_output_independently_validated,
            "github_lifecycle_exercised": github_lifecycle_exercised,
            "live_control_plane_clean": live_control_plane_clean,
            "exact_head_authority_current": exact_head_authority_current,
            "end_to_end_dry_run_passed": end_to_end_dry_run_passed,
        })
    click.echo(json.dumps(payload, indent=2))
    if not payload["ready"] and not automatic:
        raise click.exceptions.Exit(1)
