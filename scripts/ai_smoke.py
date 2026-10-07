"""Real-model smoke test for the permanent Mirror AI.

Run this only on a machine with enough GPU memory for the selected model.
It is intentionally separate from the normal unit suite.
"""
from __future__ import annotations

import json

from mirror_lab.ai_runtime import RuntimeConfig, TransformersRuntime


def main() -> int:
    runtime = TransformersRuntime(RuntimeConfig.from_env())
    output = runtime.generate(
        [
            {
                "role": "system",
                "content": "You are Mirror. Return a short answer and do not claim verification.",
            },
            {
                "role": "user",
                "content": "Give one sentence explaining why experimental results require independent verification.",
            },
        ],
        max_new_tokens=256,
    )
    print(json.dumps(output, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
