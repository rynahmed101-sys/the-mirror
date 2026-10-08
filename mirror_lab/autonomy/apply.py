"""Controlled application of an untrusted worker proposal."""

from __future__ import annotations

import hashlib
from pathlib import Path, PurePosixPath
from typing import Any

from automate.dev.inventory import InventoryError
from automate.dev.worker import validate_worker_result


def _git_blob_sha(content: bytes) -> str:
    header = f"blob {len(content)}\0".encode("utf-8")
    return hashlib.sha1(header + content).hexdigest()


def _safe_path(root: Path, relative_path: str) -> Path:
    normalized = PurePosixPath(relative_path)
    if normalized.is_absolute() or ".." in normalized.parts:
        raise InventoryError(f"worker proposal contains an unsafe path: {relative_path}")
    target = (root / Path(*normalized.parts)).resolve()
    root_resolved = root.resolve()
    try:
        target.relative_to(root_resolved)
    except ValueError as exc:
        raise InventoryError(f"worker proposal escapes checkout root: {relative_path}") from exc
    return target


def apply_worker_result(
    packet: dict[str, Any],
    result: dict[str, Any],
    *,
    root: Path,
) -> list[str]:
    """Apply an already schema-validated worker proposal to a local isolated checkout."""
    errors = validate_worker_result(result, packet)
    if errors:
        raise InventoryError("; ".join(errors))
    if result.get("status") != "proposed":
        raise InventoryError(
            "only a 'proposed' worker result may be applied by the Automate executor"
        )

    constraints = packet["constraints"]
    allowed = constraints["allowed_path_prefixes"]
    forbidden = set(constraints["forbidden_paths"])

    changed: list[str] = []
    for change in result["changes"]:
        path = str(change["path"])
        normalized = str(PurePosixPath(path))
        if not any(
            normalized == prefix.rstrip("/")
            or normalized.startswith(prefix.rstrip("/") + "/")
            for prefix in allowed
        ):
            raise InventoryError(f"worker proposal is outside allowed paths: {path}")
        if normalized in forbidden:
            raise InventoryError(f"worker proposal touches forbidden path: {path}")

        target = _safe_path(root, normalized)
        operation = change["operation"]
        expected_sha = change["expected_sha"]
        content = change.get("content")

        if not isinstance(content, str):
            raise InventoryError(f"worker proposal is missing content: {path}")

        if operation == "update":
            if not target.is_file():
                raise InventoryError(f"worker update target does not exist: {path}")
            current_sha = _git_blob_sha(target.read_bytes())
            if current_sha != expected_sha:
                raise InventoryError(
                    f"worker update is stale for {path}: expected {expected_sha}, current {current_sha}"
                )
        elif operation == "create":
            if expected_sha is not None:
                raise InventoryError(f"worker create expected_sha must be null: {path}")
            if target.exists():
                raise InventoryError(f"worker create target already exists: {path}")
            target.parent.mkdir(parents=True, exist_ok=True)
        else:
            raise InventoryError(f"unsupported worker operation: {operation}")

        if operation == "update" and expected_sha is None:
            raise InventoryError(f"worker update expected_sha must be present: {path}")

        target.write_text(content, encoding="utf-8")
        changed.append(normalized)

    return changed
