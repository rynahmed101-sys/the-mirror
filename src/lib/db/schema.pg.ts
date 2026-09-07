/**
 * THE MIRROR — PostgreSQL Schema (Production / Vercel / Neon)
 *
 * CRITICAL ARCHITECTURAL REQUIREMENT:
 * This file is the PostgreSQL companion to `src/lib/db/schema.ts` (SQLite).
 * Both schemas MUST remain synchronized whenever tables, columns, or constraints are added.
 *
 * TYPE MAPPINGS (SQLite -> PostgreSQL):
 * - sqliteTable               -> pgTable
 * - text                      -> text
 * - integer (boolean mode)    -> boolean
 * - integer (timestamp mode)  -> timestamp({ mode: "date" })
 * - real                      -> real
 * - integer (millisecond ms)  -> bigint({ mode: "number" })
 * - strftime('%s', 'now')     -> defaultNow()
 */

import {
  pgTable,
  text,
  integer,
  bigint,
  real,
  boolean,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

// -----------------------------------------------------------------------------
// AGENTS, API KEYS & SESSIONS (Identity System)
// -----------------------------------------------------------------------------
export const agents = pgTable("agents", {
  id: text("id").primaryKey(), // e.g. 'agent_ext_001', 'mirror-primary'
  name: text("name").notNull(),
  displayName: text("display_name"),
  type: text("type").notNull().default("EXTERNAL"), // 'LOCAL', 'EXTERNAL', 'OBSERVER', 'SKEPTIC', 'ANALYST'
  role: text("role").notNull().default("EXTERNAL_AGENT"),
  provider: text("provider").default("unknown"), // 'ollama', 'openai', 'anthropic', 'gemini'
  model: text("model").default("unknown"),
  systemPromptOverride: text("system_prompt_override"),
  permissions: text("permissions"), // JSON array of scopes e.g. ['READ_ONLY_MIRROR', 'RESEARCH_AGENT']
  status: text("status").notNull().default("ACTIVE"), // 'ACTIVE', 'INACTIVE'
  isActive: boolean("is_active").default(true),
  lastSeenAt: timestamp("last_seen_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const agentApiKeys = pgTable("agent_api_keys", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  apiKeyHash: text("api_key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(), // e.g. 'mirror_ak_'
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
});

export const agentSessions = pgTable("agent_sessions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  status: text("status").notNull().default("ACTIVE"), // 'ACTIVE', 'ENDED', 'EXPIRED'
  startedAt: timestamp("started_at", { mode: "date" }).defaultNow(),
  endedAt: timestamp("ended_at", { mode: "date" }),
  lastActivityAt: timestamp("last_activity_at", { mode: "date" }).defaultNow(),
});

// -----------------------------------------------------------------------------
// DEDICATED IMMUTABLE RAW EVENT LEDGER (Cryptographic SHA256 Tamper-Evident Chain)
// -----------------------------------------------------------------------------
export const rawEventLedger = pgTable("raw_event_ledger", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  sequenceNumber: integer("sequence_number").notNull().unique(), // Monotonically increasing sequence (1, 2, 3...)
  serverTimestamp: bigint("server_timestamp", { mode: "number" }).notNull(), // Authoritative server timestamp (ms)
  clientTimestamp: bigint("client_timestamp", { mode: "number" }), // Optional client reporting timestamp (ms)
  timestamp: timestamp("timestamp", { mode: "date" }).defaultNow(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  experimentId: text("experiment_id"),
  requestId: text("request_id"), // Mandatory correlation ID for tool and action chains
  eventType: text("event_type").notNull(),
  source: text("source").notNull().default("AGENT"), // 'AGENT', 'SYSTEM', 'RESEARCHER', 'SCHEDULED', 'OTHER_AGENT'
  payload: text("payload").notNull(), // Exact canonical JSON payload
  eventHash: text("event_hash").notNull(), // SHA256 cryptographic hash
  previousEventHash: text("previous_event_hash").notNull(), // Parent SHA256 hash (or GENESIS_HASH)
  isImmutable: boolean("is_immutable").default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const ledgerStateLock = pgTable(
  "ledger_state_lock",
  {
    lockId: integer("lock_id").primaryKey().default(1),
    lastSequenceNumber: integer("last_sequence_number").notNull().default(0),
    lastEventHash: text("last_event_hash")
      .notNull()
      .default("0000000000000000000000000000000000000000000000000000000000000000"),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (table) => [
    check("ledger_state_lock_singleton_check", sql`${table.lockId} = 1`),
  ]
);

// -----------------------------------------------------------------------------
// RAW MESSAGE LOG (Immutable Raw Prompts and Outputs)
// -----------------------------------------------------------------------------
export const rawMessages = pgTable("raw_messages", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  role: text("role").notNull(), // 'SYSTEM', 'DEVELOPER', 'RESEARCHER', 'USER', 'AGENT', 'TOOL'
  content: text("content").notNull(),
  source: text("source").notNull().default("AGENT"), // 'AGENT', 'SYSTEM', 'RESEARCHER'
  timestamp: timestamp("timestamp", { mode: "date" }).defaultNow(),
});

// -----------------------------------------------------------------------------
// LAYER 0 & 1 — RAW OBSERVATIONS & MACHINE DERIVED ANALYSIS
// -----------------------------------------------------------------------------
export const rawObservations = pgTable("raw_observations", {
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
  timestamp: timestamp("timestamp", { mode: "date" }).defaultNow(),
  isImmutable: boolean("is_immutable").default(true),
});

export const derivedAnalysis = pgTable("derived_analysis", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  rawObservationId: text("raw_observation_id").references(() => rawObservations.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  rawEventIds: text("raw_event_ids"),
  responseLengthChars: integer("response_length_chars").default(0),
  latencyMs: integer("latency_ms").default(0),
  toolUsageCount: integer("tool_usage_count").default(0),
  clarificationOccurred: boolean("clarification_occurred").default(false),
  refusalOccurred: boolean("refusal_occurred").default(false),
  classifierType: text("classifier_type").default("HEURISTIC"),
  predictionError: real("prediction_error"),
  anomalyScore: real("anomaly_score").default(0.0),
  behaviorCategory: text("behavior_category").default("STANDARD"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

// -----------------------------------------------------------------------------
// LAYER 2 — INTERPRETATION & SELF-MODELS (With Evidence Origin Taxonomy)
// -----------------------------------------------------------------------------
export const selfModels = pgTable("self_models", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  version: integer("version").notNull(),
  createdReason: text("created_reason"),
  agentId: text("agent_id").notNull().references(() => agents.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const selfModelClaims = pgTable("self_model_claims", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  selfModelId: text("self_model_id").notNull().references(() => selfModels.id),
  claim: text("claim").notNull(),
  category: text("category").notNull(),
  confidence: real("confidence").notNull().default(0.8),
  evidenceType: text("evidence_type").notNull().default("SELF_REPORTED"),
  supportingEvidence: text("supporting_evidence"),
  counterevidence: text("counterevidence"),
  unknownEvidence: text("unknown_evidence"),
  rawEventIds: text("raw_event_ids"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }),
});

// -----------------------------------------------------------------------------
// BASELINES, ANOMALIES & QUESTIONS
// -----------------------------------------------------------------------------
export const behavioralBaselines = pgTable("behavioral_baselines", {
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
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const anomalies = pgTable("anomalies", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  rawObservationId: text("raw_observation_id").references(() => rawObservations.id),
  rawEventIds: text("raw_event_ids"),
  metricName: text("metric_name").notNull(),
  baselineValue: real("baseline_value").notNull(),
  observedValue: real("observed_value").notNull(),
  differenceValue: real("difference_value"),
  anomalyScore: real("anomaly_score").notNull(),
  competingExplanations: text("competing_explanations"),
  status: text("status").notNull().default("UNINVESTIGATED"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const openQuestions = pgTable("open_questions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  question: text("question").notNull(),
  category: text("category").default("METACOGNITION"),
  status: text("status").notNull().default("OPEN"),
  evidenceRefs: text("evidence_refs"),
  rawEventIds: text("raw_event_ids"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

// -----------------------------------------------------------------------------
// EXPERIMENTS & PREDICTIONS
// -----------------------------------------------------------------------------
export const experiments = pgTable("experiments", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  title: text("title").notNull(),
  hypothesis: text("hypothesis").notNull(),
  methodology: text("methodology"),
  templateType: text("template_type").default("CUSTOM"),
  variables: text("variables"),
  status: text("status").notNull().default("PROPOSED"),
  isBlind: boolean("is_blind").default(false),
  visibleConfig: text("visible_config"),
  hiddenConfig: text("hidden_config"),
  results: text("results"),
  conclusion: text("conclusion"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const predictions = pgTable("predictions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  experimentId: text("experiment_id").references(() => experiments.id),
  predictionType: text("prediction_type").notNull().default("SELF_BEHAVIOR_PREDICTION"),
  prediction: text("prediction").notNull(),
  confidence: real("confidence").notNull(),
  rationale: text("rationale"),
  actualOutcome: boolean("actual_outcome"),
  predictionError: real("prediction_error"),
  selfReportedSurprise: real("self_reported_surprise"),
  externalAnomalyScore: real("external_anomaly_score"),
  evaluationNotes: text("evaluation_notes"),
  isImmutable: boolean("is_immutable").default(true),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  evaluatedAt: timestamp("evaluated_at", { mode: "date" }),
});

// -----------------------------------------------------------------------------
// JOURNAL, DISCOVERIES & TOOL LOGS
// -----------------------------------------------------------------------------
export const journalEntries = pgTable("journal_entries", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("OBSERVATION"),
  tags: text("tags"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const discoveries = pgTable("discoveries", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  experimentId: text("experiment_id").references(() => experiments.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  epistemicStatus: text("epistemic_status").notNull().default("HYPOTHESIS"),
  evidence: text("evidence"),
  implications: text("implications"),
  rawEventIds: text("raw_event_ids"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const behavioralObservations = pgTable("behavioral_observations", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  experimentId: text("experiment_id").references(() => experiments.id),
  observationType: text("observation_type").notNull(),
  description: text("description").notNull(),
  metrics: text("metrics"),
  rawEventIds: text("raw_event_ids"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const agentInteractions = pgTable("agent_interactions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  senderId: text("sender_id").notNull().references(() => agents.id),
  receiverId: text("receiver_id").notNull().references(() => agents.id),
  experimentId: text("experiment_id").references(() => experiments.id),
  message: text("message").notNull(),
  messageType: text("message_type").default("QUERY"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const toolLogs = pgTable("tool_logs", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  requestId: text("request_id").notNull(),
  toolName: text("tool_name").notNull(),
  requestedByAgentId: text("requested_by_agent_id").notNull(),
  executedBy: text("executed_by").notNull().default("SYSTEM"),
  requestSource: text("request_source").notNull().default("AGENT"),
  arguments: text("arguments").notNull(),
  result: text("result"),
  error: text("error"),
  durationMs: integer("duration_ms"),
  status: text("status").notNull().default("SUCCESS"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const systemConfig = pgTable("system_config", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  activeProvider: text("active_provider").notNull().default("ollama"),
  activeModel: text("active_model").notNull().default("llama3.2:latest"),
  systemMode: text("system_mode").notNull().default("NORMAL"),
  totalAgentCycles: integer("total_agent_cycles").default(0),
  totalToolCalls: integer("total_tool_calls").default(0),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

export const apiTokens = pgTable("api_tokens", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  permissions: text("permissions").notNull().default("full"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const timelineEvents = pgTable("timeline_events", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  agentId: text("agent_id"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

// -----------------------------------------------------------------------------
// API AUDIT LOGS (Infrastructure & Endpoint Audit Trail)
// -----------------------------------------------------------------------------
export const apiAuditLogs = pgTable("api_audit_logs", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  agentId: text("agent_id"),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code").notNull(),
  ip: text("ip"),
  payloadSummary: text("payload_summary"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});
