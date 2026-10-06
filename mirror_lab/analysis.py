import math
from typing import Any, Sequence

def finite_numbers(values: Sequence[Any]) -> list[float]:
    out = []
    for value in values:
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            out.append(number)
    return out

def trajectory_summary(values: Sequence[Any]) -> dict[str, Any]:
    """Descriptive diagnostics only; it never labels a phenomenon as physical."""
    nums = finite_numbers(values)
    if not nums:
        return {"count": 0, "finite": False}
    deltas = [b - a for a, b in zip(nums, nums[1:])]
    return {
        "count": len(nums), "finite": True, "minimum": min(nums),
        "maximum": max(nums), "first": nums[0], "last": nums[-1],
        "range": max(nums) - min(nums),
        "monotonic_non_decreasing": all(d >= 0 for d in deltas),
        "monotonic_non_increasing": all(d <= 0 for d in deltas),
    }
