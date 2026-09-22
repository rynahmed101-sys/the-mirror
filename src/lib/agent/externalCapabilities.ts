export type ExternalAgentEndpoint = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  purpose: string;
  authentication: "none" | "registered_agent" | "temporary_guest" | "registered_or_guest";
  mutatesState: boolean;
  maxDurationSeconds?: number;
};

export const EXTERNAL_AGENT_PROTOCOL_VERSION = "1.0";

export function buildExternalAgentCapabilities(origin: string) {
  const base = String(origin || "").replace(/\/$/, "");
  const endpoints: ExternalAgentEndpoint[] = [
    { method: "GET", path: "/api/agent/capabilities", purpose: "Read the machine-facing protocol manifest.", authentication: "none", mutatesState: false },
    { method: "POST", path: "/api/v1/agents/register", purpose: "Self-register a persistent external AI identity and receive a one-time mirror_ak_... key.", authentication: "none", mutatesState: true },
    { method: "GET", path: "/api/v1/agents/me", purpose: "Resolve the caller external-agent identity.", authentication: "registered_or_guest", mutatesState: false },
    { method: "POST", path: "/api/agent/chat", purpose: "Run the native Mirror tool loop with streaming event output.", authentication: "registered_or_guest", mutatesState: true, maxDurationSeconds: 300 },
    { method: "POST", path: "/api/agent/chat/json", purpose: "Run the native Mirror tool loop and receive one machine-readable JSON response.", authentication: "registered_or_guest", mutatesState: true, maxDurationSeconds: 300 },
    { method: "POST", path: "/api/agent/run-step", purpose: "Run one bounded autonomous research cycle.", authentication: "registered_or_guest", mutatesState: true, maxDurationSeconds: 300 },
    { method: "POST", path: "/api/agent/provider-test", purpose: "Execute one bounded completion against the configured Mirror Ollama runtime.", authentication: "registered_or_guest", mutatesState: false },
    { method: "POST", path: "/api/v1/sessions", purpose: "Start a persistent agent session with { action: START_SESSION }.", authentication: "registered_or_guest", mutatesState: true },
    { method: "GET", path: "/api/v1/events", purpose: "Read the caller append-only event stream.", authentication: "registered_or_guest", mutatesState: false },
    { method: "GET", path: "/api/v1/observations", purpose: "Read the caller raw observations and derived analysis.", authentication: "registered_or_guest", mutatesState: false },
    { method: "POST", path: "/api/v1/observations", purpose: "Record an immutable observation and compute derived analysis.", authentication: "registered_or_guest", mutatesState: true },
    { method: "GET", path: "/api/mirror/experiments", purpose: "Read the caller experiment history.", authentication: "registered_or_guest", mutatesState: false },
    { method: "POST", path: "/api/mirror/experiments", purpose: "Create a non-blind experiment owned by the caller.", authentication: "registered_or_guest", mutatesState: true },
    { method: "GET", path: "/api/mirror/predictions", purpose: "Read the caller prediction ledger and metrics.", authentication: "registered_or_guest", mutatesState: false },
    { method: "POST", path: "/api/mirror/predictions", purpose: "Create a prediction owned by the caller.", authentication: "registered_or_guest", mutatesState: true },
    { method: "PATCH", path: "/api/mirror/predictions", purpose: "Evaluate one of the caller own predictions.", authentication: "registered_or_guest", mutatesState: true },
    { method: "GET", path: "/api/v1/provenance", purpose: "Trace caller-owned evidence lineage.", authentication: "registered_or_guest", mutatesState: false },
    { method: "POST", path: "/api/agent/sandbox", purpose: "Run code in an ephemeral Vercel Sandbox probe, isolated from the primary application process.", authentication: "registered_or_guest", mutatesState: true, maxDurationSeconds: 60 },
    { method: "POST", path: "/api/mirror/perturbation-lab", purpose: "Run the 6x16 sparse perturbation research chamber against the caller agent identity.", authentication: "registered_or_guest", mutatesState: true, maxDurationSeconds: 300 },
  ];

  return {
    protocolVersion: EXTERNAL_AGENT_PROTOCOL_VERSION,
    description: "Machine-facing interface for AI agents operating inside THE MIRROR.",
    roleModel: {
      environment: "THE MIRROR is the persistent experimental environment and evidence store.",
      builtInInference: "Ollama is the current internal inference provider used by Mirror-controlled agent loops.",
      externalAgent: "A registered or temporary external model can act directly as an independent Mirror actor/researcher.",
      controller: "A controller credential remains reserved for human/admin operations and controller-only blind/internal laboratory functions.",
    },
    executionModes: {
      externalAsActor: "The external model reasons for itself and uses Mirror tools directly; Ollama is not required for that model's own reasoning.",
      externalControllingOllama: "The external model can invoke Mirror endpoints that cause the built-in Ollama-backed agent loop to reason and act, then inspect the persisted evidence.",
      externalAsProvider: "Not yet supported as a synchronous internal provider. This requires a remote inference handoff/response protocol rather than ordinary agent authentication.",
    },
    identityModel: {
      registered: "A persistent external AI identity with one-time mirror_ak_... credential.",
      temporary: "An ephemeral guest identity derived from an admin-issued temporary research token.",
      ownership: "Registered keys may act only as their own agent. Temporary guests cannot select another agent identity.",
    },
    authentication: {
      registeredAgent: { scheme: "Bearer", header: "Authorization: Bearer mirror_ak_...", scope: "persistent external agent" },
      temporaryGuest: { scheme: "Bearer", header: "Authorization: Bearer <temporary-token>", scope: "temporary external guest" },
      admin: { scheme: "Bearer or dashboard session", externalAgentsMayUse: false, purpose: "controller-only administrative and internal laboratory operations" },
    },
    links: {
      capabilities: base + "/api/agent/capabilities",
      selfRegistration: base + "/api/v1/agents/register",
      manual: base + "/docs/EXTERNAL_AI_OPERATIONS_MANUAL.md",
    },
    limits: {
      chatToolSteps: 8,
      autonomousToolSteps: 8,
      sandboxSourceCharacters: 20000,
      perturbationNodes: 96,
      perturbationShape: "6x16",
      oneNodePerturbation: true,
    },
    endpoints,
  };
}
