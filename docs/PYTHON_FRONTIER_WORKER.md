# Python Frontier Worker

The active deployable Mirror worker is the Python `mirror_lab` service. The older TypeScript application tree is retained as historical source, but it is not the current deployment contract.

## Start the worker

After installing this repository:

    mirror frontier-server

The equivalent module invocation is:

    python -m mirror_lab.frontier_service

The service listens on `MIRROR_FRONTIER_HOST` (default `0.0.0.0`) and `MIRROR_FRONTIER_PORT` (default `8080`), with the machine endpoint:

    POST /api/internal/frontier

## Required environment

`MIRROR_FRONTIER_JOB_TOKEN` authenticates Chanfana to the worker.

`MIRROR_AI_ENDPOINT` selects the vendor-neutral reasoning endpoint used by the worker.

`MIRROR_AI_TOKEN` is optional and is sent as a Bearer token when configured.

`MIRROR_AI_MODEL` is optional and defaults to `mirror-frontier`.

`MIRROR_STATE_DIR` optionally selects the durable SQLite brain directory. Keep this on persistent storage when the deployment supports it.

## Execution contract

The input is `mirror.frontier_job.v1`.

The worker:

1. verifies the exact 40-character Automate base revision;
2. checks the capability boundary from that revision's inventory;
3. creates a temporary detached checkout;
4. gives the AI bounded research, coding, experiment, and diagnostic tools;
5. applies model-generated edits only inside the temporary checkout;
6. rejects changes outside the canonical capability files or into forbidden control-plane files;
7. returns a bounded `mirror.frontier_result.v1` proposal and provenance.

The worker never pushes to GitHub, modifies Automate's canonical checkout, edits the phase ledger or capability inventory, or certifies its own work.

A clean local test in the Mirror worker is evidence for Automate. It is not certification.

## Chanfana wiring

Chanfana stores and transports `mirror.frontier_job.v1` and persists the returned untrusted result. It must allowlist the exact deployed Mirror endpoint and authenticate with the same frontier job secret.

Automate supplies the exact capability revision and remains responsible for reconciliation, independent verification, promotion, and certification.

## Model independence

No Ollama or Qwen dependency is required by the active Python worker. The reasoning provider is an interchangeable HTTP contract. A deployment may use a local, hosted, or future model service without changing the scientific core.
