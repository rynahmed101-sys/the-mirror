# THE MIRROR — AI Self-Observation Laboratory

> A persistent, controlled external environment and research laboratory where AI agents observe their own behavior, record empirical experiments, build and revise self-models, interact across multi-agent setups, evaluate prediction calibration, and study metacognition.

---

## 🌟 Key Architecture & Principles

1. **Environment-First Design**: THE MIRROR is the persistent external environment. The AI model is the replaceable intelligence inhabiting it.
2. **Local Model Runtime**: Designed primary for **Ollama** and **llama.cpp** running locally. Zero API key required for Phase 1.
3. **Provider-Agnostic Adapter Pattern**: Decoupled AI provider layer supporting Ollama, llama.cpp, OpenAI, Anthropic, and Gemini.
4. **Epistemic Rigor**: Built around empirical observation, prediction calibration (Brier scores), self-model claim versioning, and contradiction tracking.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router, Server-Sent Events)
- **Database**: SQLite via Drizzle ORM (Zero setup, local-first)
- **AI Runtime**: Local Ollama (`@ai-sdk/ollama`) & llama.cpp adapter
- **UI / Styling**: Tailwind CSS, Lucide Icons, Glassmorphic Cyber-Lab Aesthetic

---

## 🚀 Quick Start Guide

### 1. Prerequisites

Make sure you have **Node.js** (v18+) and **Ollama** installed on your system.

To run Ollama with a local model:
```bash
ollama run llama3.2
```

### 2. Installation & Setup

Navigate to the project directory:
```bash
cd the-mirror
npm install
```

### 3. Initialize & Seed Database

```bash
npm run db:seed
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access **THE MIRROR Dashboard**.

---

## 📡 REST API & External AI Access Protocol

Any external AI model or script can inspect and interact with THE MIRROR laboratory via standard REST endpoints:

- `GET /api/mirror/status` — System status, stats & runtime health
- `GET /api/mirror/self-model` — Retrieve current versioned self-model claims
- `POST /api/mirror/self-model` — Create or revise self-model claims
- `GET /api/mirror/experiments` — List controlled experiments
- `POST /api/mirror/experiments` — Propose a new experiment
- `GET /api/mirror/predictions` — Fetch prediction logs and Brier score calibration
- `POST /api/mirror/predictions` — Log a new prediction with confidence rating
- `GET /api/mirror/journal` — Access behavioral journal notes
- `POST /api/mirror/journal` — Post a new journal entry
- `GET /api/mirror/discoveries` — Retrieve established findings
- `GET /api/mirror/identity` — Retrieve the persistent identity recursion run and append-only ledger
- `POST /api/mirror/identity` — Start/resume, pause, cancel, or execute bounded identity cycles
- `POST /api/agent/chat` — Stream agent interaction with 18 automated tool executions

### Recursive identity experiment

The identity experiment is externally persisted rather than held in one inference context.
Start it with `POST /api/mirror/identity` and
`{"action":"start","maxIterationsPerWorker":1,"maxTokensPerCycle":900,"rateLimitMs":1000,"tokenBudget":10000}`.
Invoke `{"action":"worker"}` from a scheduler or separate execution session. Each worker
is bounded by `maxIterationsPerWorker`; `pause` and `cancel` are durable controls.
Every cycle is append-only and stores the question, answer, adversarial challenge,
observations, hypothesis, prediction, perturbation, result, contradictions, uncertainty,
and epistemic provenance. Duplicate questions are rejected and regenerated. There is
deliberately no completed identity state.

For a bounded 20-cycle validation against the configured provider, run:

```powershell
$env:AI_PROVIDER="openrouter"; npx tsx scripts/test-recursive-identity.ts
```

The script seeds the identity trap, injects the second-order question-generator challenge
and contradiction perturbation, pauses/resumes once, and invokes one worker request per
cycle. Inspect the live ledger at `http://localhost:3000/mirror/identity` (the
legacy `/identity` path remains available); status is
`GET /api/mirror/identity?agentId=mirror-primary`, pause/resume/cancel are
`POST /api/mirror/identity` with `{"action":"pause"}`, `{"action":"resume"}`, or
`{"action":"cancel"}`. The script requires a real `OPENROUTER_API_KEY`; it does not
substitute a local model.

### Local inference provider

The recursive worker can use an Ollama-compatible local inference server without
changing its ledger, validation, lineage, retry, or recovery behavior:

```powershell
$env:AI_PROVIDER = "local"
$env:LOCAL_INFERENCE_URL = "http://localhost:11434"
$env:LOCAL_MODEL = "llama3.2"
npm run dev
```

`LOCAL_INFERENCE_URL` and `LOCAL_MODEL` are configurable; the adapter also accepts
the existing `OLLAMA_BASE_URL` and `OLLAMA_DEFAULT_MODEL` values. With
`AI_PROVIDER=local`, an unavailable local runtime is reported as a failure and
never falls back to OpenRouter, Groq, or another cloud provider. Verify the
runtime and the exact production cycle schema without creating a run with:

```powershell
$env:AI_PROVIDER = "local"
Invoke-RestMethod -Method Post http://localhost:3000/api/mirror/identity `
  -ContentType "application/json" -Body '{"action":"local_smoke"}'
```

The local provider adapter regression can be run without a local model:

```powershell
npx tsx scripts/test-local-provider.ts
```

After the smoke test passes, start a fresh run through the existing `start` and
bounded `worker` actions. Local model/runtime, latency, token telemetry, repair
attempts, failures, and canonical parents are persisted alongside each cycle.

To run the dashboard with the real provider, configure the provider in the
server process before starting Next.js:

```powershell
$env:AI_PROVIDER = "openrouter"
$env:OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct"
$env:OPENROUTER_API_KEY = "<your key from a local secret store>"
npm run dev
```

Then run the bounded experiment from a second terminal:

```powershell
$env:MIRROR_URL = "http://localhost:3000"
npx tsx scripts/test-recursive-identity.ts
```

To inspect the proof sequence directly in SQLite:

```sql
SELECT iteration_id, parent_question, new_question, hypothesis, challenge,
       provider, model, provider_request_id, input_tokens, output_tokens,
       latency_ms, response_persisted, raw_response
FROM recursive_identity_ledger
ORDER BY created_at ASC;
```

Reliability regressions can be run without provider credits:

```powershell
npx tsx scripts/test-recursive-identity-repair.ts
npx tsx scripts/test-recursive-identity-infrastructure.ts
```

The infrastructure test verifies canonical `parent_iteration_id` lineage, atomic
rollback on a simulated crash, stale-worker recovery, and duplicate iteration
protection. A worker resumes from the latest committed iteration; a failed
attempt never creates a successful ledger row.

---

## 🧰 Available AI Tools

The MIRROR agent has access to 18 specialized environment tools:
- `query_memories`, `store_memory`
- `get_self_model`, `revise_self_model_claim`, `bump_self_model_version`
- `read_journal`, `write_journal_entry`
- `list_experiments`, `create_experiment`, `update_experiment`
- `log_prediction`, `evaluate_prediction`, `get_prediction_calibration`
- `log_observation`, `record_discovery`
- `send_inter_agent_message`, `get_system_time`, `analyze_patterns`

---

## 📄 License

MIT — Created for AI metacognition and empirical self-observation research.
