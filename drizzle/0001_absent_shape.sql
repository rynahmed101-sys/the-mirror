ALTER TABLE `recursive_identity_runs` ADD `duplicate_rejections` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recursive_identity_runs` ADD `error_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recursive_identity_runs` ADD `estimated_cost_usd` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recursive_identity_runs` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `recursive_identity_runs` ADD `model` text;