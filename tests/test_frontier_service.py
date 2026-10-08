from pathlib import Path

from mirror_lab.frontier_service import (
    RESULT_SCHEMA_VERSION,
    SCHEMA_VERSION,
    _validate_job,
    run_frontier_job,
)


def _job():
    return {
        "schema_version": SCHEMA_VERSION,
        "request_id": "frontier_12345678",
        "action_cycle_id": "cycle_12345678",
        "execution_kind": "mirror_frontier",
        "target": {"mirror_endpoint": "https://mirror.example/frontier"},
        "capability": {
            "id": "stage1b.series_expansions",
            "name": "Taylor series expansions",
            "task": "Implement bounded series machinery",
            "base_revision": "a" * 40,
        },
        "mission": {
            "repair_required": False,
            "current_backlog": ["stage1b.series_expansions"],
            "ledger_frontier": ["stage1b.series_expansions"],
            "automate_requests": [],
            "discovery_allowed": False,
            "ledger_hash": None,
            "required_action": "implement",
        },
        "limits": {
            "max_tool_steps": 8,
            "deadline_ms": 300000,
            "max_response_bytes": 1500000,
        },
        "permissions": {
            "network": True,
            "workspace_write": True,
            "local_execution": True,
            "git_commit": True,
            "remote_git_mutation": False,
            "canonical_mutation": False,
        },
        "provenance": {
            "correlation_id": "corr_12345678",
            "parent_ids": ["stage1b.series_expansions"],
        },
    }


def test_validate_job_enforces_exact_revision_and_mutation_boundary():
    job = _job()
    assert _validate_job(job) == []

    job["capability"]["base_revision"] = "short"
    assert any("base_revision" in error for error in _validate_job(job))

    job = _job()
    job["permissions"]["canonical_mutation"] = True
    assert any("canonical mutation" in error for error in _validate_job(job))


def test_run_frontier_job_fails_closed_without_reasoning_provider(monkeypatch, tmp_path: Path):
    monkeypatch.delenv("MIRROR_AI_ENDPOINT", raising=False)
    monkeypatch.setenv("MIRROR_STATE_DIR", str(tmp_path / "state"))

    result = run_frontier_job(_job())

    assert result["schema_version"] == RESULT_SCHEMA_VERSION
    assert result["authority"] == "UNTRUSTED_MIRROR_PROPOSAL"
    assert result["status"] == "NO_CHANGE_PROPOSED"
    assert result["proposal"]["diff"]["stdout"] == ""
    assert "MIRROR_AI_ENDPOINT is not configured" in result["unresolved"]
