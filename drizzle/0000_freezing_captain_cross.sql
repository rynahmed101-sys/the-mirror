CREATE TABLE `agent_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`api_key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	`last_used_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agent_interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`receiver_id` text NOT NULL,
	`experiment_id` text,
	`message` text NOT NULL,
	`message_type` text DEFAULT 'QUERY',
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`sender_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receiver_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`started_at` integer DEFAULT (strftime('%s', 'now')),
	`ended_at` integer,
	`last_activity_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`type` text DEFAULT 'EXTERNAL' NOT NULL,
	`role` text DEFAULT 'EXTERNAL_AGENT' NOT NULL,
	`provider` text DEFAULT 'unknown',
	`model` text DEFAULT 'unknown',
	`system_prompt_override` text,
	`permissions` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`is_active` integer DEFAULT true,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `anomalies` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`raw_observation_id` text,
	`raw_event_ids` text,
	`metric_name` text NOT NULL,
	`baseline_value` real NOT NULL,
	`observed_value` real NOT NULL,
	`difference_value` real,
	`anomaly_score` real NOT NULL,
	`competing_explanations` text,
	`status` text DEFAULT 'UNINVESTIGATED' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raw_observation_id`) REFERENCES `raw_observations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `api_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`agent_id` text,
	`endpoint` text NOT NULL,
	`method` text NOT NULL,
	`status_code` integer NOT NULL,
	`ip` text,
	`payload_summary` text,
	`created_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`permissions` text DEFAULT 'full' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `behavioral_baselines` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`period_name` text NOT NULL,
	`avg_response_length_chars` real DEFAULT 0,
	`tool_frequency` real DEFAULT 0,
	`clarification_rate` real DEFAULT 0,
	`refusal_rate` real DEFAULT 0,
	`prediction_accuracy` real DEFAULT 0,
	`avg_latency_ms` real DEFAULT 0,
	`sample_count` integer DEFAULT 0,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `behavioral_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`experiment_id` text,
	`observation_type` text NOT NULL,
	`description` text NOT NULL,
	`metrics` text,
	`raw_event_ids` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `derived_analysis` (
	`id` text PRIMARY KEY NOT NULL,
	`raw_observation_id` text,
	`agent_id` text NOT NULL,
	`session_id` text,
	`raw_event_ids` text,
	`response_length_chars` integer DEFAULT 0,
	`latency_ms` integer DEFAULT 0,
	`tool_usage_count` integer DEFAULT 0,
	`clarification_occurred` integer DEFAULT false,
	`refusal_occurred` integer DEFAULT false,
	`classifier_type` text DEFAULT 'HEURISTIC',
	`prediction_error` real,
	`anomaly_score` real DEFAULT 0,
	`behavior_category` text DEFAULT 'STANDARD',
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`raw_observation_id`) REFERENCES `raw_observations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `discoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`experiment_id` text,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`epistemic_status` text DEFAULT 'HYPOTHESIS' NOT NULL,
	`evidence` text,
	`implications` text,
	`raw_event_ids` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`title` text NOT NULL,
	`hypothesis` text NOT NULL,
	`methodology` text,
	`template_type` text DEFAULT 'CUSTOM',
	`variables` text,
	`status` text DEFAULT 'PROPOSED' NOT NULL,
	`is_blind` integer DEFAULT false,
	`visible_config` text,
	`hidden_config` text,
	`results` text,
	`conclusion` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`category` text DEFAULT 'OBSERVATION' NOT NULL,
	`tags` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `open_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`question` text NOT NULL,
	`category` text DEFAULT 'METACOGNITION',
	`status` text DEFAULT 'OPEN' NOT NULL,
	`evidence_refs` text,
	`raw_event_ids` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`experiment_id` text,
	`prediction_type` text DEFAULT 'SELF_BEHAVIOR_PREDICTION' NOT NULL,
	`prediction` text NOT NULL,
	`confidence` real NOT NULL,
	`rationale` text,
	`actual_outcome` integer,
	`prediction_error` real,
	`self_reported_surprise` real,
	`external_anomaly_score` real,
	`evaluation_notes` text,
	`is_immutable` integer DEFAULT true,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	`evaluated_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `raw_event_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`sequence_number` integer NOT NULL,
	`server_timestamp` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`client_timestamp` integer,
	`timestamp` integer DEFAULT (strftime('%s', 'now')),
	`agent_id` text NOT NULL,
	`session_id` text,
	`experiment_id` text,
	`request_id` text,
	`event_type` text NOT NULL,
	`source` text DEFAULT 'AGENT' NOT NULL,
	`payload` text NOT NULL,
	`event_hash` text NOT NULL,
	`previous_event_hash` text NOT NULL,
	`is_immutable` integer DEFAULT true,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_event_ledger_sequence_number_unique` ON `raw_event_ledger` (`sequence_number`);--> statement-breakpoint
CREATE TABLE `raw_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`session_id` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`source` text DEFAULT 'AGENT' NOT NULL,
	`timestamp` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `raw_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`session_id` text,
	`experiment_id` text,
	`event_type` text NOT NULL,
	`input` text,
	`output` text,
	`tool_call` text,
	`tool_result` text,
	`prediction` text,
	`actual_result` text,
	`timestamp` integer DEFAULT (strftime('%s', 'now')),
	`is_immutable` integer DEFAULT true,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recursive_identity_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`iteration_id` text NOT NULL,
	`parent_question` text,
	`new_question` text NOT NULL,
	`current_answer` text NOT NULL,
	`challenge` text NOT NULL,
	`observations` text NOT NULL,
	`hypothesis` text NOT NULL,
	`prediction` text NOT NULL,
	`perturbation` text NOT NULL,
	`result` text NOT NULL,
	`contradictions` text NOT NULL,
	`uncertainty` real NOT NULL,
	`new_identity_hypothesis` text NOT NULL,
	`epistemic_types` text NOT NULL,
	`context_snapshot` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`run_id`) REFERENCES `recursive_identity_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recursive_identity_ledger_iteration_id_unique` ON `recursive_identity_ledger` (`iteration_id`);--> statement-breakpoint
CREATE TABLE `recursive_identity_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`status` text DEFAULT 'PAUSED' NOT NULL,
	`max_iterations_per_worker` integer DEFAULT 1 NOT NULL,
	`rate_limit_ms` integer DEFAULT 0 NOT NULL,
	`token_budget` integer,
	`total_iterations` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	`updated_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `self_model_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`self_model_id` text NOT NULL,
	`claim` text NOT NULL,
	`category` text NOT NULL,
	`confidence` real DEFAULT 0.8 NOT NULL,
	`evidence_type` text DEFAULT 'SELF_REPORTED' NOT NULL,
	`supporting_evidence` text,
	`counterevidence` text,
	`unknown_evidence` text,
	`raw_event_ids` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	`updated_at` integer,
	FOREIGN KEY (`self_model_id`) REFERENCES `self_models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `self_models` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`created_reason` text,
	`agent_id` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` text PRIMARY KEY NOT NULL,
	`active_provider` text DEFAULT 'ollama' NOT NULL,
	`active_model` text DEFAULT 'llama3.2:latest' NOT NULL,
	`system_mode` text DEFAULT 'NORMAL' NOT NULL,
	`total_agent_cycles` integer DEFAULT 0,
	`total_tool_calls` integer DEFAULT 0,
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `timeline_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`agent_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `tool_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`session_id` text,
	`request_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`requested_by_agent_id` text NOT NULL,
	`executed_by` text DEFAULT 'SYSTEM' NOT NULL,
	`request_source` text DEFAULT 'AGENT' NOT NULL,
	`arguments` text NOT NULL,
	`result` text,
	`error` text,
	`duration_ms` integer,
	`status` text DEFAULT 'SUCCESS' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
