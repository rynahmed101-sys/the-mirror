"""Git/branch guardrails for capability packets."""
from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

from automate.dev.inventory import load_inventory


def changed_files(base: str | None = None, head: str = "HEAD") -> list[str]:
    if base:
        cmd = ["git", "diff", "--name-only", f"{base}...{head}"]
    else:
        cmd = ["git", "diff", "--name-only", "HEAD^", head]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return [line.strip() for line in out.stdout.splitlines() if line.strip()]


def validate_branch_scope(branch: str, files: list[str]) -> list[str]:
    data = load_inventory()
    shared = set(data["branch_policy"]["shared_integration_files"])
    errors: list[str] = []

    if branch.startswith("feat/"):
        if branch.startswith("feat/autonomous-backlog-driver-") or branch.startswith("feat/self-correcting-worker-recovery-"):
            return errors
        control_plane = [
            ref for ref in data.get("control_plane_references", [])
            if ref.get("branch") == branch
            and str(ref.get("state", "")).startswith("open")
        ]
        if control_plane:
            return errors
        touched = sorted(shared.intersection(files))
        if touched:
            errors.append(
                "Capability branches must not modify shared integration files: "
                + ", ".join(touched)
            )
        recorded = [
            item["id"]
            for item in data["capabilities"]
            for ref in item["references"]
            if ref.get("type") == "pr"
            and ref.get("branch") == branch
            and str(ref.get("state", "")).startswith("open")
        ]
        if not recorded:
            # Worker-generated capability PRs may precede canonical bookkeeping.
            # Permit only a known, non-terminal capability with a typed worker branch.
            suffix_match = re.match(r"^feat/(.+?)-[0-9a-f]{8,40}$", branch)
            candidate = suffix_match.group(1) if suffix_match else ""
            known = {
                item["id"]
                for item in data["capabilities"]
                if item.get("implementation_state") not in {"merged_main", "superseded", "abandoned"}
            }
            if candidate not in known:
                errors.append(
                    f"Capability branch '{branch}' has no active ownership record in "
                    "docs/CAPABILITY_INVENTORY.json."
                )
        elif len(recorded) > 1:
            errors.append(
                f"Capability branch '{branch}' is claimed by multiple capabilities: "
                + ", ".join(sorted(set(recorded)))
            )
    elif branch.startswith("integrate/"):
        return errors
    elif any(branch.startswith(prefix) for prefix in data["branch_policy"].get("allowed_maintenance_branch_prefixes", [])):
        return errors
    else:
        errors.append(
            f"Unsupported development branch '{branch}'. Use feat/<capability> "
            "for isolated capability work or integrate/<batch> for reconciliation."
        )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--branch", required=True)
    parser.add_argument("--base")
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--changed-file", action="append", dest="changed_files")
    args = parser.parse_args()
    files = args.changed_files if args.changed_files is not None else changed_files(args.base, args.head)
    errors = validate_branch_scope(args.branch, files)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"BRANCH_SCOPE_OK: {args.branch} ({len(files)} changed files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
