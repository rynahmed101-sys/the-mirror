ALTER TABLE `recursive_identity_ledger` ADD `raw_response` text NOT NULL;--> statement-breakpoint
ALTER TABLE `recursive_identity_runs` ADD `max_tokens_per_cycle` integer DEFAULT 900 NOT NULL;