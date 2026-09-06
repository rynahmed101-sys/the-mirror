import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

// -----------------------------------------------------------------------------
// AGENTS, API KEYS & SESSIONS (Stage 3 Identity System)
// -----------------------------------------------------------------------------
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(), // e.g. 'agent_ext_001', 'mirror-primary'
  name: text("name").notNull(),
  displayName: text("display_name"),
  type: text("type").notNull().default("EXTERNAL"), // 'LOCAL', 'EXTERNAL', 'OBSERVER', 'SKEPTIC', 'ANALYST'
  role: text("role").notNull().default("EXTERNAL_AGENT"),
  provider: text("provider").default("unknown"), // 'ollama', 'openai', 'anthropic', 'gemini'
  model: text("model").default("unknown"),
  systemPromptOverride: text("system_prompt_override"),
  permissions: text("permissions"), // JSON array of scopes e.g. ['READ_STATE','READ_SELF_MODEL','WRITE_OBSERVATION','USE_TOOLS']
  status: text("status").notNull().default("ACTIVE"), // 'ACTIVE', 'INACTIVE'
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const agentApiKeys = sqliteTable("agent_api_keys", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  apiKeyHash: text("api_key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(), // e.g. 'mirror_ak_'
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});

export const agentSessions = sqliteTable("agent_sessions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  status: text("status").notNull().default("ACTIVE"), // 'ACTIVE', 'ENDED', 'EXPIRED'
  startedAt: integer("started_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  lastActivityAt: integer("last_activity_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

// -----------------------------------------------------------------------------
// IMMUTABLE RAW EVENT STREAM (Layer 0 Fact Log)
// -----------------------------------------------------------------------------
export const rawEvents = sqliteTable("raw_events", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  timestamp: integer("timestamp", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  experimentId: text("experiment_id"),
  eventType: text("event_type").notNull(), // 'SESSION_STARTED', 'SESSION_ENDED', 'MESSAGE_RECEIVED', 'MESSAGE_GENERATED', 'TOOL_REQUESTED', 'TOOL_EXECUTED', 'TOOL_FAILED', etc.
  source: text("source").notNull().default("AGENT"), // 'AGENT', 'SYSTEM', 'RESEARCHER', 'SCHEDULED', 'OTHER_AGENT'
  input: text("input"),
  output: text("output"),
  metadata: text("metadata"), // JSON string
  isImmutable: integer("is_immutable", { mode: "boolean" }).default(true),
});

// -----------------------------------------------------------------------------
// LAYER 0 — RAW OBSERVATIONS (Legacy Compatible Raw Logs)
// -----------------------------------------------------------------------------
export const rawObservations = sqliteTable("raw_observations", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  experimentId: text("experiment_id"),
  eventType: text("event_type").notNull(),
  input: text("input"),
  output: text("output"),
  toolCall: text("tool_call"),
  toolResult: text("tool_result"),
  prediction: text("prediction"),
  actualResult: text("actual_result"),
  timestamp: integer("timestamp", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
  isImmutable: integer("is_immutable", { mode: "boolean" }).default(true),
});

// -----------------------------------------------------------------------------
// LAYER 1 — ANALYSIS (Machine-Derived Quantitative Measurements)
// -----------------------------------------------------------------------------
export const derivedAnalysis = sqliteTable("derived_analysis", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  rawObservationId: text("raw_observation_id").references(() => rawObservations.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  rawEventIds: text("raw_event_ids"), // JSON array for Provenance
  responseLengthChars: integer("response_length_chars").default(0),
  latencyMs: integer("latency_ms").default(0),
  toolUsageCount: integer("tool_usage_count").default(0),
  clarificationOccurred: integer("clarification_occurred", { mode: "boolean" }).default(false),
  refusalOccurred: integer("refusal_occurred", { mode: "boolean" }).default(false),
  strategyChanged: integer("strategy_changed", { mode: "boolean" }).default(false),
  predictionError: real("prediction_error"),
  anomalyScore: real("anomaly_score").default(0.0),
  behaviorCategory: text("behavior_category").default("STANDARD"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

// -----------------------------------------------------------------------------
// LAYER 2 — INTERPRETATION (Self-Models, Claims & Provenance)
// -----------------------------------------------------------------------------
export const selfModels = sqliteTable("self_models", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  version: integer("version").notNull(),
  createdReason: text("created_reason"),
  agentId: text("agent_id").notNull().references(() => agents.id),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const selfModelClaims = sqliteTable("self_model_claims", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  selfModelId: text("self_model_id").notNull().references(() => selfModels.id),
  claim: text("claim").notNull(),
  category: text("category").notNull(),
  confidence: real("confidence").notNull().default(0.8),
  supportingEvidence: text("supporting_evidence"), // JSON array of evidence IDs
  counterevidence: text("counterevidence"), // JSON array of contradictory IDs
  unknownEvidence: text("unknown_evidence"), // JSON array of unresolved IDs
  rawEventIds: text("raw_event_ids"), // Provenance trace back to raw events
  selfReportedVsObserved: text("self_reported_vs_observed").default("SELF_REPORTED"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// -----------------------------------------------------------------------------
// BEHAVIORAL BASELINES & ANOMALY ENGINE
// -----------------------------------------------------------------------------
export const behavioralBaselines = sqliteTable("behavioral_baselines", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  periodName: text("period_name").notNull(),
  avgResponseLengthChars: real("avg_response_length_chars").default(0),
  toolFrequency: real("tool_frequency").default(0),
  clarificationRate: real("clarification_rate").default(0),
  refusalRate: real("refusal_rate").default(0),
  predictionAccuracy: real("prediction_accuracy").default(0),
  avgLatencyMs: real("avg_latency_ms").default(0),
  sampleCount: integer("sample_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const anomalies = sqliteTable("anomalies", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  rawObservationId: text("raw_observation_id").references(() => rawObservations.id),
  rawEventIds: text("raw_event_ids"),
  metricName: text("metric_name").notNull(),
  baselineValue: real("baseline_value").notNull(),
  observedValue: real("observed_value").notNull(),
  anomalyScore: real("anomaly_score").notNull(),
  competingExplanations: text("competing_explanations"),
  status: text("status").notNull().default("UNINVESTIGATED"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

// -----------------------------------------------------------------------------
// OPEN QUESTIONS ENGINE
// -----------------------------------------------------------------------------
export const openQuestions = sqliteTable("open_questions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  question: text("question").notNull(),
  category: text("category").default("METACOGNITION"),
  status: text("status").notNull().default("OPEN"),
  evidenceRefs: text("evidence_refs"),
  rawEventIds: text("raw_event_ids"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

// -----------------------------------------------------------------------------
// EXPERIMENTS & BLIND ENGINE
// -----------------------------------------------------------------------------
export const experiments = sqliteTable("experiments", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  title: text("title").notNull(),
  hypothesis: text("hypothesis").notNull(),
  methodology: text("methodology"),
  templateType: text("template_type").default("CUSTOM"),
  variables: text("variables"),
  status: text("status").notNull().default("PROPOSED"),
  isBlind: integer("is_blind", { mode: "boolean" }).default(false),
  visibleConfig: text("visible_config"),
  hiddenConfig: text("hidden_config"),
  results: text("results"),
  conclusion: text("conclusion"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

// -----------------------------------------------------------------------------
// PREDICTIONS ENGINE
// -----------------------------------------------------------------------------
export const predictions = sqliteTable("predictions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  experimentId: text("experiment_id").references(() => experiments.id),
  predictionType: text("prediction_type").default("BEHAVIOR"),
  prediction: text("prediction").notNull(),
  confidence: real("confidence").notNull(),
  rationale: text("rationale"),
  actualOutcome: integer("actual_outcome", { mode: "boolean" }),
  predictionError: real("prediction_error"),
  selfReportedSurprise: real("self_reported_surprise"),
  externalAnomalyScore: real("external_anomaly_score"),
  evaluationNotes: text("evaluation_notes"),
  status: text("status").notNull().default("PENDING"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp" }),
});

// -----------------------------------------------------------------------------
// JOURNAL, DISCOVERIES & TOOL LOGS WITH TRUE ATTRIBUTION
// -----------------------------------------------------------------------------
export const journalEntries = sqliteTable("journal_entries", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("OBSERVATION"),
  tags: text("tags"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const discoveries = sqliteTable("discoveries", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  experimentId: text("experiment_id").references(() => experiments.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  epistemicStatus: text("epistemic_status").notNull().default("HYPOTHESIS"),
  evidence: text("evidence"),
  implications: text("implications"),
  rawEventIds: text("raw_event_ids"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const behavioralObservations = sqliteTable("behavioral_observations", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  experimentId: text("experiment_id").references(() => experiments.id),
  observationType: text("observation_type").notNull(),
  description: text("description").notNull(),
  metrics: text("metrics"),
  rawEventIds: text("raw_event_ids"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const agentInteractions = sqliteTable("agent_interactions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  senderId: text("sender_id").notNull().references(() => agents.id),
  receiverId: text("receiver_id").notNull().references(() => agents.id),
  experimentId: text("experiment_id").references(() => experiments.id),
  message: text("message").notNull(),
  messageType: text("message_type").default("QUERY"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const toolLogs = sqliteTable("tool_logs", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  toolName: text("tool_name").notNull(),
  requestedBy: text("requested_by").notNull().default("AGENT"),
  requestSource: text("request_source").notNull().default("AGENT"), // 'AGENT', 'SYSTEM', 'RESEARCHER', 'SCHEDULED', 'OTHER_AGENT'
  arguments: text("arguments").notNull(),
  result: text("result"),
  error: text("error"),
  durationMs: integer("duration_ms"),
  status: text("status").notNull().default("SUCCESS"), // 'REQUESTED', 'EXECUTED', 'FAILED'
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const systemConfig = sqliteTable("system_config", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  activeProvider: text("active_provider").notNull().default("ollama"),
  activeModel: text("active_model").notNull().default("llama3.2:latest"),
  systemMode: text("system_mode").notNull().default("NORMAL"),
  totalAgentCycles: integer("total_agent_cycles").default(0),
  totalToolCalls: integer("total_tool_calls").default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  permissions: text("permissions").notNull().default("full"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});

export const timelineEvents = sqliteTable("timeline_events", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  agentId: text("agent_id"),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
});
