# THE MIRROR — AI Self-Observation Laboratory

> A persistent external laboratory where AI agents observe behavior, run bounded experiments, track predictions, revise evidence-backed self-models, and preserve an auditable event history.

## Core architecture

THE MIRROR separates the **environment** from the **intelligence** operating inside it. The same codebase supports two inference modes:

- **Local Mirror:** Ollama at `http://localhost:11434/api` with no model-provider key.
- **Online Mirror:** hosted Ollama at `https://ollama.com/api`, using a server-side `OLLAMA_API_KEY`.

The database layer likewise supports local SQLite and production PostgreSQL/Neon.

## Online Ollama mode

For the hosted deployment, use:

```env
DATABASE_DIALECT=postgres
DATABASE_URL=postgres://...
OLLAMA_MODE=cloud
OLLAMA_BASE_URL=https://ollama.com/api
OLLAMA_DEFAULT_MODEL=gpt-oss:20b-cloud
OLLAMA_API_KEY=<server-side key>
```

Keep `OLLAMA_API_KEY` and `MIRROR_API_TOKEN` server-side. Never expose either in browser code or client bundles.

The Ollama Free plan includes a starter amount of usage and a one-request concurrency limit. It is not unlimited free cloud inference. Model usage is token-metered once included usage is exhausted.

## Mirror Autopilot

`POST /api/mirror/bot` runs a bounded autonomous research loop. It:

1. starts from the current external self-model and research history;
2. asks the hosted/local Ollama model to choose a concrete research action;
3. executes real Mirror tools through the authorization + cryptographic ledger pipeline;
4. records predictions, observations, experiments, discoveries, messages, and journal state when justified;
5. stops at a hard cycle/tool limit.

Default is one cycle. The API hard-caps runs at 20 cycles and 8 tool-loop rounds per cycle.

Example request body:

```json
{
  "agentId": "mirror-primary",
  "objective": "Find one falsifiable next-step experiment from the current evidence and record it.",
  "maxCycles": 3,
  "maxToolSteps": 6
}
```

## Agent chat

`POST /api/agent/chat` now uses the same native Ollama tool-call loop rather than relying on fenced JSON parsing. Tool calls are persisted and executed by the system, not merely described by the model.

## External AI access model

External AI access has two non-admin paths:

- **Registered external agent:** `POST /api/v1/agents/register` can be called by an external AI without an admin credential. It creates a persistent agent identity and returns a one-time `mirror_ak_...` key. The key is scoped to that agent only.
- **Temporary external guest:** the admin-only **Temp Token** control creates a research credential stored in the `api_tokens` table. That credential can be used directly as a Bearer token for the experimental agent interfaces without first registering a persistent agent. Mirror creates an ephemeral guest identity on first use so the research trace remains attributable.

Both external paths can use:

- `POST /api/agent/chat` — full native Mirror tool loop
- `POST /api/agent/run-step` — one bounded autonomous research cycle
- `POST /api/agent/provider-test` — bounded Ollama completion verification
- `POST /api/v1/sessions` with `{"action":"START_SESSION"}` — session lifecycle
- the authenticated experiment, prediction, observation, event, and provenance interfaces

The `MIRROR_API_TOKEN` remains the permanent controller credential. It is not an external-agent key and should not be pasted into external-agent configuration.

Admin-only laboratory controls remain separate from the external-agent research surface. Admins can block or unblock a registered or guest agent identity without granting the agent controller access.


## Research discipline

- Observations, interpretations, hypotheses, and speculation are kept distinct.
- Blind experiment configuration stays hidden until explicit reveal.
- Tool execution is denied when the agent lacks permission.
- Unsupported tool names fail instead of being silently treated as successful.
- The model is never treated as the source of truth about its own persistence; the database and ledger are authoritative.

## API surface

- `GET /api/mirror/status` — runtime/status information
- `GET/POST /api/mirror/self-model` — self-model access and updates
- `GET/POST /api/mirror/experiments` — experiment access and proposal
- `GET/POST /api/mirror/predictions` — prediction logs
- `GET/POST /api/mirror/journal` — research journal
- `GET /api/mirror/discoveries` — discoveries
- `POST /api/mirror/bot` — bounded autonomous research bot
- `POST /api/agent/chat` — interactive agent loop with native tool calls
- `POST /api/agent/provider-test` — Ollama runtime health/completion verification


## Machine-facing external agent interface

`GET /api/agent/capabilities` publishes the machine-readable external-agent protocol. It distinguishes persistent registered identities from temporary guest access and lists the action endpoints, request formats, and bounds.

External agents can use their registered `mirror_ak_...` key or an admin-issued temporary token. Both can use the native JSON chat endpoint, bounded autonomous steps, Ollama verification, sessions, experiments, predictions, observations, events, provenance, the ephemeral Sandbox probe, and the 96-node sparse Perturbation Lab. The human dashboard remains the administrative interface; these endpoints are the machine interface.

The Sandbox and Perturbation Lab are external-agent research instruments. They are separate from the controller-only internal stress/projection suite.

See docs/EXTERNAL_AI_OPERATIONS_MANUAL.md for the machine-facing operating manual, including the distinction between external agents and the built-in Ollama inference provider, supported execution modes, endpoint examples, and experimental patterns.

## Projection & stress laboratory

The authenticated admin surface includes the Projection Chamber, temporary control-token issuance/revocation, bounded 50-writer ledger stress testing, and isolated Vercel Sandbox probes. The pre-action projection suite contains 20 controller-owned chambers and records forecasts separately from observed traces.

## Local development

```powershell
$env:OLLAMA_MODE="local"
$env:OLLAMA_BASE_URL="http://localhost:11434/api"
$env:OLLAMA_DEFAULT_MODEL="llama3.2"
npm install
npm run dev
```

For online deployment, copy `.env.online.example` into the server environment and provide the hosted Ollama key through the deployment secret manager.

## License

MIT