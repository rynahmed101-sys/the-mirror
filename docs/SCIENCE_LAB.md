# Mirror Science Lab

Mirror is the evaluation layer for experimental mathematics and physics. It is not the canonical calculation engine.

## Separation of responsibility
Math/Physics suite (Automate or another calculation service) owns formulas, numerical algorithms, canonical units, symbolic derivations and domain-specific implementations.
Mirror Science Lab defines test cases, invokes trusted BaseTheory adapters, measures RMSE/absolute/relative error and runtime, classifies numerical stability, records results through the existing Drizzle experiments ledger, and provides an isolated pre-validation sandbox.

## Theory lifecycle
1. Idea — write or generate an unverified script.
2. Sandbox — run it in an ephemeral Vercel Sandbox with network deny-all.
3. Adapter — once reviewed, implement a BaseTheory subclass in the science registry or a dedicated theories module.
4. Reference cases — provide known expected outputs.
5. Evaluate — the lab computes error metrics and runtime.
6. Classify — Tier-1/2/3 or Unstable/Failed.
7. Record — the result is stored as SCIENCE_THEORY_RUN in the existing Drizzle experiments table.
8. Promote externally — only after human/researcher review should a theory be moved into the canonical Math/Physics suite.

## Stability labels
- Gold Standard Tier-1: RMSE <= 1e-10 and maximum absolute deviation <= 1e-9, with no failed/non-finite cases.
- Silver Standard Tier-2: RMSE <= 1e-6 and maximum absolute deviation <= 1e-5.
- Experimental Tier-3: RMSE <= 1e-3 and maximum absolute deviation <= 1e-2.
- Unstable: above those thresholds.
- Failed: execution failure, non-finite output, or no cases.

These are laboratory thresholds, not scientific proof. Low numerical error only says the implementation matched the supplied reference cases.

## API
GET /api/science-lab/theories — catalog and recent runs.
POST /api/science-lab/run — evaluate a registered theory against reference cases.
GET /api/science-lab/sandbox — sandbox capability metadata.
POST /api/science-lab/sandbox — execute unverified JavaScript in an ephemeral, network-isolated microVM.

The sandbox is an execution chamber, not a promotion mechanism. It deliberately has no automatic path from script to trusted theory.
