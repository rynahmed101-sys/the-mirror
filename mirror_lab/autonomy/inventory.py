"""Machine-readable capability inventory and control-plane validation."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
INVENTORY_PATH = ROOT / "docs" / "CAPABILITY_INVENTORY.json"
SCHEMA_PATH = ROOT / "schemas" / "automate-capability-inventory-v1.json"

ACTIVE_STATES = {"active_development", "delegated", "awaiting_reconciliation", "reconciled"}
TERMINAL_STATES = {"merged_main", "superseded", "abandoned"}


class InventoryError(ValueError):
    """Raised for an inconsistent capability inventory."""


def validate_inventory(data: dict[str, Any]) -> list[str]:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    errors = [
        f"{list(err.path) or '$'}: {err.message}"
        for err in Draft202012Validator(schema).iter_errors(data)
    ]
    if errors:
        return errors

    records = data["capabilities"]
    by_id = {item["id"]: item for item in records}
    if len(by_id) != len(records):
        errors.append("duplicate capability id")
    orders = [item["order"] for item in records]
    if len(set(orders)) != len(orders):
        errors.append("duplicate capability order")

    for item in records:
        cid = item["id"]
        for dep in item["depends_on"]:
            if dep not in by_id:
                errors.append(f"{cid}: unknown dependency '{dep}'")
            elif by_id[dep]["order"] >= item["order"]:
                errors.append(f"{cid}: dependency '{dep}' is not earlier in the ladder")
        if cid in item["depends_on"]:
            errors.append(f"{cid}: self dependency")
        state = item["implementation_state"]
        v = item["verification"]
        if state == "merged_main" and item["authority"]["kind"] not in {"main", "main_merge"}:
            errors.append(f"{cid}: merged_main must name main authority")
        if state in ACTIVE_STATES:
            has_open_pr = any(ref.get("type") == "pr" and str(ref.get("state", "")).startswith("open") for ref in item["references"])
            has_engine_ref = any(ref.get("type") == "branch" and ref.get("branch") == "engine" and ref.get("state") == "active_development" for ref in item["references"])
            if not has_open_pr and not has_engine_ref:
                errors.append(f"{cid}: active state requires an open PR or active engine reference")
        if item["safe_to_delete"] and not (state in {"superseded", "abandoned"} or item.get("preserved_in")):
            errors.append(f"{cid}: safe_to_delete requires a preservation record")
        if v.get("certified") and (
            state != "merged_main"
            or not v.get("merged_main")
            or not v.get("exact_head_verified")
            or not v.get("security_audit_verified")
        ):
            errors.append(f"{cid}: certified requires merged main plus exact-head and security evidence")

    integration_numbers: set[int] = set()
    for ref in data.get("integration_references", []):
        number = ref.get("number")
        if not isinstance(number, int):
            errors.append("integration_references: every entry needs an integer PR number")
            continue
        if number in integration_numbers:
            errors.append(f"integration_references: duplicate PR #{number}")
        integration_numbers.add(number)

    direct_owners: dict[int, str] = {}
    for item in records:
        for ref in item["references"]:
            if ref.get("type") != "pr" or not str(ref.get("state", "")).startswith("open"):
                continue
            if ref.get("role") == "integration_batch":
                continue
            number = ref.get("number")
            if isinstance(number, int):
                old = direct_owners.get(number)
                if old and old != item["id"]:
                    errors.append(f"PR #{number}: direct ownership collision between '{old}' and '{item['id']}'")
                direct_owners[number] = item["id"]

    for number in integration_numbers:
        if number in direct_owners:
            errors.append(f"PR #{number}: cannot be both capability-owned and integration-owned")

    return errors


def load_inventory() -> dict[str, Any]:
    data = json.loads(INVENTORY_PATH.read_text(encoding="utf-8"))
    errors = validate_inventory(data)
    if errors:
        raise InventoryError("; ".join(errors))
    return data


def get_capability(capability_id: str) -> dict[str, Any]:
    for item in load_inventory()["capabilities"]:
        if item["id"] == capability_id:
            return item
    raise InventoryError(f"Unknown capability '{capability_id}'")


def active_references(data: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for item in data["capabilities"]:
        if item["implementation_state"] not in ACTIVE_STATES:
            continue
        for ref in item["references"]:
            if (ref.get("type") == "pr" and str(ref.get("state", "")).startswith("open")) or (ref.get("type") == "branch" and ref.get("branch") == "engine" and ref.get("state") == "active_development"):
                result.append({"capability_id": item["id"], **ref})
    return result


def _dependencies_terminal(item: dict[str, Any], by_id: dict[str, dict[str, Any]]) -> bool:
    return all(by_id[dep]["implementation_state"] in TERMINAL_STATES for dep in item["depends_on"])


def next_action(data: dict[str, Any]) -> dict[str, Any]:
    by_id = {x["id"]: x for x in data["capabilities"]}
    unresolved = [
        x for x in sorted(data["capabilities"], key=lambda x: x["order"])
        if x["implementation_state"] not in TERMINAL_STATES and x["stage"] != "7"
    ]
    if not unresolved:
        return {"action": "none", "reason": "No unresolved pre-Stage-7 work is recorded."}

    earliest = unresolved[0]
    blocked = [
        dep for dep in earliest["depends_on"]
        if by_id[dep]["implementation_state"] not in TERMINAL_STATES
    ]
    if blocked:
        return {
            "action": "blocked",
            "reason": "The earliest unresolved capability cannot advance until its dependencies reach a terminal state.",
            "capability_id": earliest["id"],
            "blocked_by": blocked,
        }

    same_band = [
        x for x in unresolved
        if x["order"] // 100 == earliest["order"] // 100
        and _dependencies_terminal(x, by_id)
    ]
    active = [x for x in same_band if x["implementation_state"] in ACTIVE_STATES]
    if active:
        engine_active = [x for x in active if x["implementation_state"] == "active_development"]
        if engine_active:
            return {
                "action": "continue_development",
                "reason": "An active engine capability exists; continue implementation and verification on the living engine trunk before release promotion.",
                "capability_ids": [x["id"] for x in engine_active],
            }
        return {
            "action": "reconcile",
            "reason": "Existing ready packets must be reconciled before opening or delegating further work.",
            "capability_ids": [x["id"] for x in active],
        }

    planned = [x for x in same_band if x["implementation_state"] == "planned" and not any(
        ref.get("type") == "pr" and str(ref.get("state", "")).startswith("open")
        for ref in x["references"]
    )]
    if planned:
        return {
            "action": "implement",
            "reason": "The earliest ready capability has no active implementation packet.",
            "capability_id": planned[0]["id"],
        }

    return {
        "action": "inspect",
        "reason": "The earliest ready band contains work that is neither active nor claimable; repair its inventory state before proceeding.",
        "capability_ids": [x["id"] for x in same_band],
    }


def next_unclaimed(data: dict[str, Any]) -> dict[str, Any] | None:
    by_id = {x["id"]: x for x in data["capabilities"]}
    for item in sorted(data["capabilities"], key=lambda x: x["order"]):
        if (
            item["implementation_state"] == "planned"
            and not any(
                ref.get("type") == "pr" and str(ref.get("state", "")).startswith("open")
                for ref in item["references"]
            )
            and _dependencies_terminal(item, by_id)
        ):
            return item
    return None


def queue_snapshot(data: dict[str, Any]) -> dict[str, Any]:
    """Return a complete deterministic view of the current capability queue."""
    by_id = {x["id"]: x for x in data["capabilities"]}
    unresolved = [
        x for x in sorted(data["capabilities"], key=lambda x: x["order"])
        if x["implementation_state"] not in TERMINAL_STATES and x["stage"] != "7"
    ]
    blocked = []
    ready = []
    preserved = []
    for item in unresolved:
        blockers = [
            dep for dep in item["depends_on"]
            if by_id[dep]["implementation_state"] not in TERMINAL_STATES
        ]
        if blockers:
            blocked.append({"capability_id": item["id"], "blocked_by": blockers})
        elif item["implementation_state"] == "planned":
            ready.append(item["id"])
        if item["implementation_state"] == "preserved_out_of_order":
            preserved.append(item["id"])
    return {
        "next_action": next_action(data),
        "next_unclaimed": (next_unclaimed(data)["id"] if next_unclaimed(data) else None),
        "active_packets": active_references(data),
        "ready_by_dependency": ready,
        "blocked": blocked,
        "preserved_out_of_order": preserved,
        "note": "ready_by_dependency is informational; next_action remains the strict roadmap gate.",
    }


def summarize() -> dict[str, Any]:
    try:
        data = load_inventory()
    except Exception as exc:
        return {"schema_version":"automate.capability_inventory.v1","valid":False,"errors":[str(exc)]}
    counts: dict[str, int] = {}
    for item in data["capabilities"]:
        counts[item["implementation_state"]] = counts.get(item["implementation_state"], 0) + 1
    candidate = next_unclaimed(data)
    return {
        "schema_version": data["schema_version"],
        "valid": True,
        "authoritative_branch": data["authoritative_branch"],
        "capability_count": len(data["capabilities"]),
        "state_counts": counts,
        "active_reference_count": len(active_references(data)),
        "next_action": next_action(data),
        "next_unclaimed": candidate["id"] if candidate else None,
        "queue": queue_snapshot(data),
        "inventory_file": "docs/CAPABILITY_INVENTORY.json",
        "schema_file": "schemas/automate-capability-inventory-v1.json",
    }


def packet(capability_id: str) -> dict[str, Any]:
    item = get_capability(capability_id)
    return {
        "capability": item["id"],
        "stage": item["stage"],
        "name": item["name"],
        "implementation_state": item["implementation_state"],
        "authority": item["authority"],
        "dependencies": item["depends_on"],
        "canonical_files": item["canonical_files"],
        "shared_integration_points": item["shared_integration_points"],
        "references": item["references"],
        "verification_required": item["verification"],
        "safe_to_delete": item["safe_to_delete"],
        "notes": item.get("notes"),
        "agent_contract": {
            "feature_rule": "Use feat/ branches for isolated capability packets; use integrate/ branches for controlled reconciliation.",
            "shared_integration_rule": "Do not modify shared integration files from a capability packet unless the packet itself is an integration branch.",
            "authority_rule": "An unmerged branch is an implementation container, never an authoritative merged-main state.",
        },
    }
