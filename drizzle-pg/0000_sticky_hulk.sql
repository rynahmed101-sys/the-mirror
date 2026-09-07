CREATE TABLE "agent_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"experiment_id" text,
	"message" text NOT NULL,
	"message_type" text DEFAULT 'QUERY',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp,
	"last_activity_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"type" text DEFAULT 'EXTERNAL' NOT NULL,
	"role" text DEFAULT 'EXTERNAL_AGENT' NOT NULL,
	"provider" text DEFAULT 'unknown',
	"model" text DEFAULT 'unknown',
	"system_prompt_override" text,
	"permissions" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"is_active" boolean DEFAULT true,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"raw_observation_id" text,
	"raw_event_ids" text,
	"metric_name" text NOT NULL,
	"baseline_value" real NOT NULL,
	"observed_value" real NOT NULL,
	"difference_value" real,
	"anomaly_score" real NOT NULL,
	"competing_explanations" text,
	"status" text DEFAULT 'UNINVESTIGATED' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" bigint NOT NULL,
	"agent_id" text,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer NOT NULL,
	"ip" text,
	"payload_summary" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"permissions" text DEFAULT 'full' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "behavioral_baselines" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"period_name" text NOT NULL,
	"avg_response_length_chars" real DEFAULT 0,
	"tool_frequency" real DEFAULT 0,
	"clarification_rate" real DEFAULT 0,
	"refusal_rate" real DEFAULT 0,
	"prediction_accuracy" real DEFAULT 0,
	"avg_latency_ms" real DEFAULT 0,
	"sample_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "behavioral_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"experiment_id" text,
	"observation_type" text NOT NULL,
	"description" text NOT NULL,
	"metrics" text,
	"raw_event_ids" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "derived_analysis" (
	"id" text PRIMARY KEY NOT NULL,
	"raw_observation_id" text,
	"agent_id" text NOT NULL,
	"session_id" text,
	"raw_event_ids" text,
	"response_length_chars" integer DEFAULT 0,
	"latency_ms" integer DEFAULT 0,
	"tool_usage_count" integer DEFAULT 0,
	"clarification_occurred" boolean DEFAULT false,
	"refusal_occurred" boolean DEFAULT false,
	"classifier_type" text DEFAULT 'HEURISTIC',
	"prediction_error" real,
	"anomaly_score" real DEFAULT 0,
	"behavior_category" text DEFAULT 'STANDARD',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discoveries" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"experiment_id" text,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"epistemic_status" text DEFAULT 'HYPOTHESIS' NOT NULL,
	"evidence" text,
	"implications" text,
	"raw_event_ids" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"title" text NOT NULL,
	"hypothesis" text NOT NULL,
	"methodology" text,
	"template_type" text DEFAULT 'CUSTOM',
	"variables" text,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"is_blind" boolean DEFAULT false,
	"visible_config" text,
	"hidden_config" text,
	"results" text,
	"conclusion" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'OBSERVATION' NOT NULL,
	"tags" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_state_lock" (
	"lock_id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_sequence_number" integer DEFAULT 0 NOT NULL,
	"last_event_hash" text DEFAULT '0000000000000000000000000000000000000000000000000000000000000000' NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ledger_state_lock_singleton_check" CHECK ("ledger_state_lock"."lock_id" = 1)
);
--> statement-breakpoint
CREATE TABLE "open_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"question" text NOT NULL,
	"category" text DEFAULT 'METACOGNITION',
	"status" text DEFAULT 'OPEN' NOT NULL,
	"evidence_refs" text,
	"raw_event_ids" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"experiment_id" text,
	"prediction_type" text DEFAULT 'SELF_BEHAVIOR_PREDICTION' NOT NULL,
	"prediction" text NOT NULL,
	"confidence" real NOT NULL,
	"rationale" text,
	"actual_outcome" boolean,
	"prediction_error" real,
	"self_reported_surprise" real,
	"external_anomaly_score" real,
	"evaluation_notes" text,
	"is_immutable" boolean DEFAULT true,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"evaluated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "raw_event_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_number" integer NOT NULL,
	"server_timestamp" bigint NOT NULL,
	"client_timestamp" bigint,
	"timestamp" timestamp DEFAULT now(),
	"agent_id" text NOT NULL,
	"session_id" text,
	"experiment_id" text,
	"request_id" text,
	"event_type" text NOT NULL,
	"source" text DEFAULT 'AGENT' NOT NULL,
	"payload" text NOT NULL,
	"event_hash" text NOT NULL,
	"previous_event_hash" text NOT NULL,
	"is_immutable" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "raw_event_ledger_sequence_number_unique" UNIQUE("sequence_number")
);
--> statement-breakpoint
CREATE TABLE "raw_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"session_id" text,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"source" text DEFAULT 'AGENT' NOT NULL,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "raw_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"session_id" text,
	"experiment_id" text,
	"event_type" text NOT NULL,
	"input" text,
	"output" text,
	"tool_call" text,
	"tool_result" text,
	"prediction" text,
	"actual_result" text,
	"timestamp" timestamp DEFAULT now(),
	"is_immutable" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "self_model_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"self_model_id" text NOT NULL,
	"claim" text NOT NULL,
	"category" text NOT NULL,
	"confidence" real DEFAULT 0.8 NOT NULL,
	"evidence_type" text DEFAULT 'SELF_REPORTED' NOT NULL,
	"supporting_evidence" text,
	"counterevidence" text,
	"unknown_evidence" text,
	"raw_event_ids" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "self_models" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"created_reason" text,
	"agent_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" text PRIMARY KEY NOT NULL,
	"active_provider" text DEFAULT 'ollama' NOT NULL,
	"active_model" text DEFAULT 'llama3.2:latest' NOT NULL,
	"system_mode" text DEFAULT 'NORMAL' NOT NULL,
	"total_agent_cycles" integer DEFAULT 0,
	"total_tool_calls" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"agent_id" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tool_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"session_id" text,
	"request_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"requested_by_agent_id" text NOT NULL,
	"executed_by" text DEFAULT 'SYSTEM' NOT NULL,
	"request_source" text DEFAULT 'AGENT' NOT NULL,
	"arguments" text NOT NULL,
	"result" text,
	"error" text,
	"duration_ms" integer,
	"status" text DEFAULT 'SUCCESS' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "agent_api_keys" ADD CONSTRAINT "agent_api_keys_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_sender_id_agents_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_receiver_id_agents_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_raw_observation_id_raw_observations_id_fk" FOREIGN KEY ("raw_observation_id") REFERENCES "public"."raw_observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavioral_baselines" ADD CONSTRAINT "behavioral_baselines_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavioral_observations" ADD CONSTRAINT "behavioral_observations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behavioral_observations" ADD CONSTRAINT "behavioral_observations_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_analysis" ADD CONSTRAINT "derived_analysis_raw_observation_id_raw_observations_id_fk" FOREIGN KEY ("raw_observation_id") REFERENCES "public"."raw_observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_analysis" ADD CONSTRAINT "derived_analysis_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_questions" ADD CONSTRAINT "open_questions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_event_ledger" ADD CONSTRAINT "raw_event_ledger_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_messages" ADD CONSTRAINT "raw_messages_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_observations" ADD CONSTRAINT "raw_observations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_model_claims" ADD CONSTRAINT "self_model_claims_self_model_id_self_models_id_fk" FOREIGN KEY ("self_model_id") REFERENCES "public"."self_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_models" ADD CONSTRAINT "self_models_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_logs" ADD CONSTRAINT "tool_logs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;