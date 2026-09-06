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
- `POST /api/agent/chat` — Stream agent interaction with 18 automated tool executions

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
