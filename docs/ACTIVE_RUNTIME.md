# Active Runtime Boundary

THE MIRROR's active scientific runtime is the Python laboratory under `mirror_lab/`.

THE MIRROR is **AI-operated**. The Python scientific core is the instrument; an AI/plugin layer is the primary control surface. No human-facing web interface is required for scientific operation.

The old Next.js/Drizzle/hosted-database application is no longer the scientific runtime. Its deployment and database configuration has been decommissioned from this branch.

## Explicitly disabled

- Vercel deployment is paused for the linked `the-mirror` project.
- Vercel deployments for the current Git branch are blocked.
- Neon/Postgres configuration has been removed from the active project configuration.
- Supabase configuration has been removed from the active project configuration.
- Drizzle configuration and migration configuration have been removed.
- Hosted Ollama projection CI has been removed.

## Scientific persistence

The first evidence ledger is local SQLite through `mirror_lab.ledger.EvidenceLedger`.

This is deliberate. The lab must remain useful without an account, cloud service, network connection, or hosted database.

## Scientific execution

The first execution path is:

~~~text
AI request / hypothesis
        ->
model / experiment
        ->
local scientific runner
        ->
observations
        ->
analysis
        ->
local evidence ledger
        ->
AI interpretation / next experiment
~~~

The AI-facing orchestration facade is `mirror_lab.operator.LabOperator`.

It is intentionally thin: it coordinates scientific operations but does not decide whether a result is true, false, physical, or novel.

## Machine-first operation

Scientific operations must be available through Python APIs and machine-readable structures.

A future CLI, API, notebook, plugin, or web interface is a control surface over the same local scientific core. It must not duplicate the scientific logic.

The first intended external operator is an AI agent connected through the user's plugin environment. Provider-specific integration belongs outside the scientific kernel.

## What happens next

The remaining legacy web tree is transitional code and must not be treated as the scientific architecture. It will be removed or replaced as the Python laboratory gains equivalent local capabilities.

Do not reconnect Vercel, Supabase, Neon, Drizzle, or another hosted database merely to make development convenient.

If a future web interface is useful, it must be a client of the local scientific core, not its foundation.
