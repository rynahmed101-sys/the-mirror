import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================
// AGENTS
// ============================================================
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // e.g., "MIRROR-PRIMARY"
  role: text("role").notNull(), // PRIMARY | OBSERVER | SKEPTIC | ANALYST | COUNTERARGUMENT | CUSTOM
  description: text("description"),
  modelProvider: text("model_provider").notNull().default("ollama"),
  modelName: text("model_name").notNull().default("llama3.2"),
  systemPrompt: text("system_prompt"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  metadata: text("metadata", { mode: "json" }),
});

// ============================================================
// MEMORY SYSTEM
// ============================================================
export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  experimentId: text("experiment_id"),
  
  // Memory tier
  tier: text("tier").notNull(), // SHORT_TERM | SESSION | LONG_TERM | RESEARCH | SELF_MODEL
  
  // Content
  content: text("content").notNull(),
  summary: text("summary"),
  
  // Categorization
  category: text("category"), // observation | reflection | fact | hypothesis | tool_result | etc.
  
  // Epistemic status — the AI must not treat all memories as equally true
  epistemicStatus: text("epistemic_status").notNull().default("OBSERVATION"),
  // FACT | OBSERVATION | INTERPRETATION | HYPOTHESIS | SPECULATION | DISPROVEN

  // Confidence 0.0 to 1.0
  confidence: real("confidence").notNull().default(0.5),
  
  // Metadata
  source: text("source").notNull().default("agent"), // agent | researcher | system | tool
  createdBy: text("created_by"),
  relatedExperiment: text("related_experiment"),
  version: integer("version").notNull().default(1),
  
  tags: text("tags", { mode: "json" }), // string[]
  embedding: text("embedding"), // for future vector search
  
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  expiresAt: text("expires_at"), // null = permanent
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
});

// ============================================================
// SELF-MODEL (VERSIONED)
// ============================================================
export const selfModels = sqliteTable("self_models", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  version: integer("version").notNull(),
  label: text("label"), // e.g., "Self Model v3"
  summary: text("summary"), // Overall summary of this version
  changeSummary: text("change_summary"), // What changed from previous version
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  createdBy: text("created_by").notNull().default("agent"), // agent | researcher
  isLatest: integer("is_latest", { mode: "boolean" }).notNull().default(false),
  metadata: text("metadata", { mode: "json" }),
});

export const selfModelClaims = sqliteTable("self_model_claims", {
  id: text("id").primaryKey(),
  selfModelId: text("self_model_id").notNull().references(() => selfModels.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  
  // The claim itself
  claim: text("claim").notNull(),
  category: text("category").notNull(), 
  // behavioral_tendency | strength | weakness | error_pattern | uncertainty_pattern
  // prediction_accuracy | response_tendency | adaptation_pattern | unresolved_question
  
  // Evidence
  supportingEvidence: text("supporting_evidence", { mode: "json" }), // string[]
  counterEvidence: text("counter_evidence", { mode: "json" }), // string[]
  
  confidence: real("confidence").notNull().default(0.5),
  
  // Status lifecycle
  status: text("status").notNull().default("NEW"),
  // NEW | SUPPORTED | UNCERTAIN | CONTRADICTED | DISPROVEN
  
  // Versioning
  introducedInVersion: integer("introduced_in_version").notNull(),
  lastUpdatedInVersion: integer("last_updated_in_version").notNull(),
  
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  
  relatedExperiments: text("related_experiments", { mode: "json" }), // string[]
});

// ============================================================
// RESEARCH JOURNAL
// ============================================================
export const journalEntries = sqliteTable("journal_entries", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  experimentId: text("experiment_id"),
  
  title: text("title").notNull(),
  
  // Structured entry
  observation: text("observation").notNull(),
  interpretation: text("interpretation"),
  hypothesis: text("hypothesis"),
  alternativeExplanation: text("alternative_explanation"),
  nextQuestion: text("next_question"),
  
  confidence: real("confidence").default(0.5),
  
  // Authorship
  createdBy: text("created_by").notNull().default("agent"), // agent | researcher
  
  // Versioning — never silently overwrite
  version: integer("version").notNull().default(1),
  previousVersionId: text("previous_version_id"),
  
  tags: text("tags", { mode: "json" }), // string[]
  
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
});

// ============================================================
// EXPERIMENT SYSTEM
// ============================================================
export const experiments = sqliteTable("experiments", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  
  // Core definition
  title: text("title").notNull(),
  researchQuestion: text("research_question").notNull(),
  conditions: text("conditions", { mode: "json" }), // experimental conditions
  variables: text("variables", { mode: "json" }), // { independent, dependent, controlled }
  
  // Hypothesis (hidden in blind mode)
  initialHypothesis: text("initial_hypothesis"),
  isBlind: integer("is_blind", { mode: "boolean" }).notNull().default(false),
  hypothesisRevealedAt: text("hypothesis_revealed_at"), // when hidden hypothesis was revealed
  
  // State machine
  state: text("state").notNull().default("DRAFT"),
  // DRAFT | READY | RUNNING | COMPLETED | ANALYZING | ARCHIVED
  
  // Results
  actualBehavior: text("actual_behavior"),
  predictionError: text("prediction_error"),
  observedPatterns: text("observed_patterns", { mode: "json" }), // string[]
  unexpectedResults: text("unexpected_results"),
  possibleExplanations: text("possible_explanations", { mode: "json" }), // string[]
  alternativeExplanations: text("alternative_explanations", { mode: "json" }), // string[]
  conclusion: text("conclusion"),
  confidence: real("confidence"),
  
  // Links
  followUpExperimentId: text("follow_up_experiment_id"),
  relatedExperiments: text("related_experiments", { mode: "json" }), // string[]
  
  // Metadata
  createdBy: text("created_by").notNull().default("researcher"), // researcher | agent
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  
  tags: text("tags", { mode: "json" }), // string[]
  metadata: text("metadata", { mode: "json" }),
});

// ============================================================
// PREDICTIONS
// ============================================================
export const predictions = sqliteTable("predictions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  experimentId: text("experiment_id").references(() => experiments.id),
  
  // What the agent predicted
  predictionText: text("prediction_text").notNull(),
  predictionCategory: text("prediction_category"), // behavior | output | reasoning | emotion_analog
  confidence: real("confidence").notNull().default(0.5),
  
  // What actually happened
  actualOutcome: text("actual_outcome"),
  
  // Error analysis
  predictionAccurate: integer("prediction_accurate", { mode: "boolean" }),
  errorMagnitude: real("error_magnitude"), // 0.0 (exact) to 1.0 (completely wrong)
  errorAnalysis: text("error_analysis"),
  surpriseLevel: real("surprise_level"), // how unexpected was the actual outcome
  
  // Task context
  taskDescription: text("task_description"),
  taskInput: text("task_input"),
  
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  resolvedAt: text("resolved_at"),
  
  metadata: text("metadata", { mode: "json" }),
});

// ============================================================
// BEHAVIORAL OBSERVATIONS
// ============================================================
export const observations = sqliteTable("observations", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  experimentId: text("experiment_id"),
  
  // Raw data (never interpretation)
  observationType: text("observation_type").notNull(),
  // response_pattern | reasoning_structure | refusal | verbosity | uncertainty |
  // contradiction | adaptation | preference_analog | strategy_change | error_recurrence
  
  // CRITICAL: Separate data from interpretation
  dataPoint: text("data_point").notNull(), // the raw observation
  statisticalContext: text("statistical_context"), // "occurred in 19% of ambiguous cases"
  interpretation: text("interpretation"), // may be null — do not auto-populate
  interpretationConfidence: real("interpretation_confidence"),
  
  epistemicStatus: text("epistemic_status").notNull().default("OBSERVATION"),
  // DATA | PATTERN | INTERPRETATION | HYPOTHESIS
  
  // Source evidence
  sourceInteractionIds: text("source_interaction_ids", { mode: "json" }), // string[]
  
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  createdBy: text("created_by").notNull().default("system"), // system | agent | researcher
  
  tags: text("tags", { mode: "json" }),
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
});

// ============================================================
// DISCOVERIES
// ============================================================
export const discoveries = sqliteTable("discoveries", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  
  title: text("title").notNull(),
  
  // Structured discovery format
  discovery: text("discovery").notNull(),
  evidence: text("evidence").notNull(),
  previousBelief: text("previous_belief"),
  newObservation: text("new_observation").notNull(),
  whyUnexpected: text("why_unexpected"),
  alternativeExplanation: text("alternative_explanation"),
  
  confidence: real("confidence").notNull().default(0.5),
  
  // Was this incorporated into the self-model?
  incorporatedIntoSelfModel: integer("incorporated_into_self_model", { mode: "boolean" }).default(false),
  selfModelVersion: integer("self_model_version"),
  
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  createdBy: text("created_by").notNull().default("agent"),
  
  relatedExperiments: text("related_experiments", { mode: "json" }),
  tags: text("tags", { mode: "json" }),
});

// ============================================================
// BEHAVIORAL PATTERNS (detected statistically)
// ============================================================
export const behavioralPatterns = sqliteTable("behavioral_patterns", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  
  name: text("name").notNull(),
  description: text("description").notNull(),
  
  patternType: text("pattern_type").notNull(),
  // premature_closure | ambiguity_resolution | over_explanation | repetitive_reasoning
  // contradiction | refusal | uncertainty | confidence_change | verbosity_change
  // adaptation | persistence | error_recurrence | preference_analog | strategy_change
  
  // CRITICAL: Keep data and interpretation separate
  statisticalObservation: text("statistical_observation").notNull(), // raw numbers
  interpretation: text("interpretation"), // explicit label — do not auto-populate
  
  occurrenceCount: integer("occurrence_count").notNull().default(0),
  occurrenceRate: real("occurrence_rate"), // 0.0 to 1.0
  sampleSize: integer("sample_size"),
  
  firstDetected: text("first_detected").notNull().default(sql`(datetime('now'))`),
  lastDetected: text("last_detected"),
  
  status: text("status").notNull().default("ACTIVE"),
  // ACTIVE | FADING | STABLE | DISPROVEN
  
  relatedObservations: text("related_observations", { mode: "json" }), // string[]
  tags: text("tags", { mode: "json" }),
});

// ============================================================
// AGENT SESSIONS
// ============================================================
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  startedAt: text("started_at").notNull().default(sql`(datetime('now'))`),
  endedAt: text("ended_at"),
  modelProvider: text("model_provider").notNull(),
  modelName: text("model_name").notNull(),
  messageCount: integer("message_count").notNull().default(0),
  metadata: text("metadata", { mode: "json" }),
});

// ============================================================
// CHAT MESSAGES
// ============================================================
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  
  role: text("role").notNull(), // user | assistant | system | tool
  content: text("content").notNull(),
  
  toolCalls: text("tool_calls", { mode: "json" }), // tool invocations
  toolResults: text("tool_results", { mode: "json" }), // tool outputs
  
  experimentId: text("experiment_id"),
  predictionId: text("prediction_id"),
  
  tokenCount: integer("token_count"),
  modelProvider: text("model_provider"),
  modelName: text("model_name"),
  
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  metadata: text("metadata", { mode: "json" }),
});

// ============================================================
// TOOL CALL LOG (security requirement — every tool call logged)
// ============================================================
export const toolCallLogs = sqliteTable("tool_call_logs", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id"),
  messageId: text("message_id"),
  experimentId: text("experiment_id"),
  
  toolName: text("tool_name").notNull(),
  input: text("input", { mode: "json" }),
  output: text("output", { mode: "json" }),
  
  status: text("status").notNull().default("SUCCESS"),
  // SUCCESS | ERROR | UNAUTHORIZED | TIMEOUT
  
  durationMs: integer("duration_ms"),
  error: text("error"),
  
  calledAt: text("called_at").notNull().default(sql`(datetime('now'))`),
});

// ============================================================
// INTER-AGENT MESSAGES
// ============================================================
export const agentMessages = sqliteTable("agent_messages", {
  id: text("id").primaryKey(),
  fromAgentId: text("from_agent_id").notNull().references(() => agents.id),
  toAgentId: text("to_agent_id").notNull().references(() => agents.id),
  
  subject: text("subject"),
  content: text("content").notNull(),
  
  requestType: text("request_type"),
  // analysis | challenge | question | independent_review | pattern_search
  
  // The response from the target agent
  response: text("response"),
  respondedAt: text("responded_at"),
  
  // Context isolation — what the receiving agent was/was not shown
  sharedContext: text("shared_context", { mode: "json" }), // what context was shared
  isolatedFrom: text("isolated_from", { mode: "json" }), // what was deliberately hidden
  
  sentAt: text("sent_at").notNull().default(sql`(datetime('now'))`),
  metadata: text("metadata", { mode: "json" }),
});

// ============================================================
// TIMELINE EVENTS (unified event log)
// ============================================================
export const timelineEvents = sqliteTable("timeline_events", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").references(() => agents.id),
  sessionId: text("session_id"),
  experimentId: text("experiment_id"),
  
  eventType: text("event_type").notNull(),
  // session_start | session_end | experiment_created | experiment_started
  // experiment_completed | prediction_made | prediction_resolved
  // self_model_revised | discovery | observation | journal_entry
  // tool_called | agent_message | pattern_detected | contradiction_found
  
  title: text("title").notNull(),
  description: text("description"),
  
  // Structured data
  entityId: text("entity_id"), // ID of the related entity
  entityType: text("entity_type"), // experiment | prediction | self_model | etc.
  
  data: text("data", { mode: "json" }),
  
  occurredAt: text("occurred_at").notNull().default(sql`(datetime('now'))`),
  importance: integer("importance").notNull().default(3), // 1-5
});

// ============================================================
// FILE STORAGE INDEX
// ============================================================
export const fileRecords = sqliteTable("file_records", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").references(() => agents.id),
  
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  
  category: text("category").notNull(),
  // document | dataset | visualization | journal_export | self_model_snapshot
  // experiment_result | research_paper | code
  
  description: text("description"),
  version: integer("version").notNull().default(1),
  previousVersionId: text("previous_version_id"),
  
  relatedExperimentId: text("related_experiment_id"),
  
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
  metadata: text("metadata", { mode: "json" }),
});

// ============================================================
// API TOKENS (for external AI clients)
// ============================================================
export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  token: text("token").notNull().unique(),
  hashedToken: text("hashed_token").notNull(),
  
  permissions: text("permissions", { mode: "json" }), // string[] of allowed routes
  
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  lastUsedAt: text("last_used_at"),
  expiresAt: text("expires_at"),
  
  createdBy: text("created_by").default("researcher"),
  description: text("description"),
});

// ============================================================
// SYSTEM CONFIG
// ============================================================
export const systemConfig = sqliteTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  updatedBy: text("updated_by").default("system"),
});

// ============================================================
// RESEARCH SOURCES (for web research tool - Phase 2)
// ============================================================
export const researchSources = sqliteTable("research_sources", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").references(() => agents.id),
  experimentId: text("experiment_id"),
  
  url: text("url").notNull(),
  title: text("title"),
  summary: text("summary"),
  
  sourceReliability: real("source_reliability"), // 0.0 to 1.0
  researchRelevance: text("research_relevance"),
  
  // IMPORTANT: clearly separate external knowledge from self-observations
  knowledgeType: text("knowledge_type").notNull().default("external"),
  // external | self_observation | cross_reference
  
  fetchedAt: text("fetched_at").notNull().default(sql`(datetime('now'))`),
  content: text("content"), // cached content
  
  tags: text("tags", { mode: "json" }),
});

// ============================================================
// TYPES (exported for use across the app)
// ============================================================
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type SelfModel = typeof selfModels.$inferSelect;
export type NewSelfModel = typeof selfModels.$inferInsert;
export type SelfModelClaim = typeof selfModelClaims.$inferSelect;
export type NewSelfModelClaim = typeof selfModelClaims.$inferInsert;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;
export type Prediction = typeof predictions.$inferSelect;
export type NewPrediction = typeof predictions.$inferInsert;
export type Observation = typeof observations.$inferSelect;
export type NewObservation = typeof observations.$inferInsert;
export type Discovery = typeof discoveries.$inferSelect;
export type NewDiscovery = typeof discoveries.$inferInsert;
export type BehavioralPattern = typeof behavioralPatterns.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ToolCallLog = typeof toolCallLogs.$inferSelect;
export type AgentMessage = typeof agentMessages.$inferSelect;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type FileRecord = typeof fileRecords.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type SystemConfig = typeof systemConfig.$inferSelect;
