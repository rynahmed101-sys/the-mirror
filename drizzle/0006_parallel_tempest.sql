CREATE TABLE `recursive_identity_workers` (
	`worker_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`last_heartbeat_at` integer NOT NULL,
	`started_at` integer NOT NULL,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`stale_threshold_ms` integer DEFAULT 300000 NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `recursive_identity_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `recursive_identity_ledger` ADD `iteration_number` integer;--> statement-breakpoint
ALTER TABLE `recursive_identity_ledger` ADD `parent_iteration_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `recursive_identity_ledger_run_iteration_idx` ON `recursive_identity_ledger` (`run_id`,`iteration_number`);