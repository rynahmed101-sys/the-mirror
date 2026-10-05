# Active Runtime Boundary

THE MIRROR's active scientific runtime is the Python laboratory under `mirror_lab/`.

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

```text
Hypothesis
   -> Model
   -> Experiment
   -> Local runner
   -> Observations
   -> Analysis
   -> Local evidence ledger
```

## What happens next

The remaining legacy web tree is transitional code and must not be treated as the scientific architecture. It will be removed or replaced as the Python laboratory gains equivalent local capabilities.

Do not reconnect Vercel, Supabase, Neon, Drizzle, or another hosted database merely to make development convenient.

If a future web interface is useful, it must be a client of the local scientific core, not its foundation.
