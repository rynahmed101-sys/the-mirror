CREATE TABLE `recursive_identity_failures` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`iteration_number` integer NOT NULL,
	`attempt_count` integer NOT NULL,
	`validation_error` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'FAILED' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`run_id`) REFERENCES `recursive_identity_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
