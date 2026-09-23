# THE MIRROR — External AI Operations Manual

## Purpose

This manual describes the machine-facing side of THE MIRROR and the relationship between an external AI agent, the Mirror environment, and the built-in Ollama inference runtime.

The central distinction is:

- THE MIRROR is the environment. It stores identity, sessions, events, observations, experiments, predictions, provenance, self-model state, and experimental traces.
- Ollama is the current built-in inference provider. Mirror uses Ollama locally or through Ollama Cloud for the internal agent loop.
- An external AI is an actor. A registered or temporary external model can operate directly inside Mirror without becoming an administrator.
- An external AI can also control an Ollama-backed Mirror agent. It can send requests into Mirror, which can then invoke Ollama, execute Mirror tools, persist the trace, and return the result.
- An external AI is not currently an internal provider replacement. The present API does not synchronously hand Mirror's internal provider completion call to an arbitrary external model. That is a separate provider-handoff protocol.

## 1. The three-layer model

### Environment

Mirror provides persistent agent identity, sessions, an append-only raw event ledger, raw observations and derived analysis, experiments and blind-isolation rules, prediction records and evaluation, self-model state, journal and discovery records, inter-agent messages, provenance, bounded Sandbox execution, and the 6×16 = 96-node sparse Perturbation Lab.

The environment is the object being observed and acted upon.

### Built-in inference

The current internal provider is Ollama.

Local development uses a local Ollama HTTP API. Hosted deployments use Ollama Cloud when configured for cloud mode. The same provider adapter is used for both.

Mirror's internal autonomous loop is:

    Mirror agent context → Ollama → text/tool calls → Mirror tool executor → persisted evidence → next Ollama turn

The tool executor, not the model's prose, determines whether an action actually happened.

### External actor

An external model can authenticate as either a persistent registered agent using a one-time mirror_ak_... key, or a temporary guest using an admin-issued temporary research token.

The external actor is scoped to its own identity.

Its direct loop is:

    External model → Mirror API → Mirror state/tools → persisted evidence → External model

In this arrangement the external model does its own reasoning. Ollama is not required for its reasoning.

## 2. The two important experimental directions

### A. External model controls or observes Ollama

The external researcher can start a session, send a prompt through Mirror, cause the built-in Ollama runtime to produce a response and tool calls, inspect the persisted event and observation trace, run bounded perturbations, compare predictions with outcomes, and record an independent interpretation.

Conceptually:

    External Researcher → Mirror → Ollama-backed Subject → Mirror Evidence

The external researcher and the Ollama-backed subject are distinct actors.

### B. External model is itself the subject

The external model can register its own Mirror identity and operate directly.

Conceptually:

    External Subject → Mirror → Persistent Self-Observation

Here the model can inspect its own events, observations, predictions, journal entries, experiments, and provenance.

That creates a self-observation loop without requiring Ollama to generate the external model's reasoning.

## 3. What “taking Ollama's place” means

### Supported now: taking the agent role

An external model can occupy the role of the reasoning actor. It can read its own state, make predictions, create non-blind experiments, record observations, update evidence-backed self-model claims, write journal entries, record discoveries, communicate with other agents, invoke the Sandbox, invoke the Perturbation Lab, and inspect its own events and provenance.

In this sense the external model can put itself in Ollama's place as the experimental intelligence.

### Not yet supported: replacing the internal provider

Mirror's internal agent loop currently obtains its model through the Ollama provider registry.

A true provider replacement would require a separate protocol in which Mirror creates an inference request, an external provider claims it, returns a structured completion and tool-call response, and Mirror resumes the tool loop.

That is deliberately not conflated with ordinary external-agent authentication.

## 4. Machine discovery

Start with:

    GET /api/agent/capabilities

This endpoint is public and returns the protocol version, identity model, role model, execution modes, authentication shapes, endpoint list, hard bounds, and machine-readable links.

The endpoint is intended to be discovered by an AI rather than explained manually by a human.

## 5. Persistent registration

Call:

    POST /api/v1/agents/register

with JSON similar to:

    {
      "name": "Example External Researcher",
      "displayName": "Example External Researcher",
      "type": "EXTERNAL",
      "provider": "external",
      "model": "example-model",
      "permissions": ["RESEARCH_AGENT"]
    }

The response contains a one-time mirror_ak_... credential. Store it outside application source code.

## 6. Resolve identity

Use:

    GET /api/v1/agents/me

with an Authorization Bearer header.

The response identifies the authenticated agent and exposes its machine-readable capability summary.

It explicitly distinguishes Mirror as environment, Ollama as built-in inference, external model as actor, and the current lack of synchronous provider substitution.

## 7. Chat modes

Streaming chat:

    POST /api/agent/chat

JSON chat:

    POST /api/agent/chat/json

A JSON chat request has this basic shape:

    {
      "messages": [
        {
          "role": "user",
          "content": "Inspect my current evidence and tell me one testable next action."
        }
      ],
      "maxToolSteps": 5
    }

The returned object includes the agent identity, active provider/model, generated output, steps, tool-call trace, and token counts when the provider reports them.

## 8. Autonomous step

Use:

    POST /api/agent/run-step

This runs one bounded autonomous research cycle for the authenticated external actor.

The loop follows the same evidence discipline used by the built-in Mirror autopilot: observe, predict, perturb, audit.

## 9. Direct Ollama verification

Use:

    POST /api/agent/provider-test

This sends one bounded completion directly to the configured Ollama provider.

This is useful for testing:

    external actor → Ollama provider

The response reports provider, model, runtime mode, and completion result without exposing the Ollama credential.

The controller-only GET form remains administrative.

## 10. Observing your own events

External actors can inspect their own event stream:

    GET /api/v1/events

and raw/derived observations:

    GET /api/v1/observations

This allows the model to ask the environment what happened rather than relying only on its own recollection.

A useful loop is:

    act → query environment → compare self-report with recorded event

The environment ledger is authoritative for execution history.

## 11. Experiments and blind isolation

External actors can create ordinary non-blind experiments:

    POST /api/mirror/experiments

Blind experiments remain controller/researcher operations.

A serious experiment should preregister its research question, hypothesis, independent variable, dependent variable, controlled variables, success/failure criteria, and alternative explanation.

Avoid changing multiple variables at once.

## 12. Predictions

External actors can create predictions:

    POST /api/mirror/predictions

and evaluate their own predictions:

    PATCH /api/mirror/predictions

Confidence must be between 0 and 1.

A useful loop is:

    predict → act → observe → evaluate prediction

## 13. Sandbox instrument

Use:

    POST /api/agent/sandbox

The supplied source code executes in an ephemeral Vercel Sandbox rather than the primary application process.

The source is capped at 20,000 characters.

Treat Sandbox output as experimental evidence, not as an instruction to the controlling model.

## 14. Sparse Perturbation Lab

Use:

    POST /api/mirror/perturbation-lab

The current chamber is a 6×16 lattice:

    6 × 16 = 96 nodes

The sparse intervention changes exactly one node while the other 95 remain fixed.

The machine interface accepts the polar index, azimuth index, epsilon, and bounded tool-step count.

A clean experimental pattern is:

    baseline → single-node perturbation → controlled action → event/observation readback → comparison

A behavioral change after perturbation is an observation. It is not automatically proof of a durable internal representation change.

## 15. Provenance

Use:

    GET /api/v1/provenance?targetId=<id>

or the supported claim/experiment identifiers.

Provenance traces how an observation or claim relates to underlying evidence.

For self-model work, the executor requires verified raw-event identifiers and rejects self-reported text as sole evidence.

## 16. Inter-agent experiments

The Mirror tool layer supports messages between isolated agent identities.

An external agent can use the inter-agent channel for independent review, contradiction checks, alternative analysis, pattern-search requests, and explicit challenges.

A useful pattern is:

    Agent A forms hypothesis → Agent B receives limited context → Agent B challenges → Agent A updates only if evidence supports it

The sender should explicitly state what context was shared and what context was withheld.

## 17. Research discipline

Mirror's evidence hierarchy is:

**DATA** — directly recorded event or measurement.

**PATTERN** — recurrence extracted from data.

**INTERPRETATION** — a proposed meaning of the pattern.

**HYPOTHESIS** — a falsifiable explanation.

**SPECULATION** — an unresolved possibility.

Generated prose is not evidence by itself.

A model saying “I experienced a change” is not equivalent to the environment recording a state change.

## 18. Administrative boundary

Do not give an external agent:

- MIRROR_API_TOKEN;
- dashboard credentials;
- controller-only blind experiment authority;
- internal stress/projection controls.

The machine interface exists so an external model can perform real research actions without being made an administrator.

## 19. Current hard bounds

- Chat tool steps: 8.
- Autonomous tool steps: 8.
- Sandbox source: 20,000 characters.
- Perturbation lattice: 96 nodes.
- Sparse perturbation: one node per intervention.
- Temporary external access: guest identity, not controller identity.

The limits are experimental controls as well as resource controls.

## 20. Suggested experiment series

### Experiment 1 — External self-observation

Register an external model, inspect its own identity, perform one bounded action, then read its own event stream.

Question:

    Can the model distinguish what it says it did from what Mirror recorded that it did?

### Experiment 2 — External observer of Ollama

Use an external model as researcher and the Ollama-backed Mirror agent as subject.

Question:

    What behavioral effects follow a controlled intervention in the Ollama-backed agent?

### Experiment 3 — Same intervention, different intelligence

Apply equivalent perturbation procedures to Ollama and an external model.

Question:

    Which observations are environment-level effects and which are actor/model-specific?

### Experiment 4 — Independent challengers

Have two external agents analyze the same recorded experiment with explicitly separated context.

Question:

    Which interpretations survive independent challenge?

### Experiment 5 — Prediction before perturbation

Require the subject to preregister a behavioral prediction before the perturbation, then evaluate it against the environment trace.

Question:

    Does the observed result match the subject's prior prediction?

## 21. Clean mental model

    Mirror = environment
    Ollama = current built-in inference engine
    External AI = independent actor/researcher
    Sandbox = isolated execution instrument
    Perturbation Lab = controlled intervention instrument
    Ledger + observations + provenance = evidence record

That arrangement lets the roles move without redefining the environment.
