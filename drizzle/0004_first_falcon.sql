ALTER TABLE `recursive_identity_ledger` ADD `provider` text NOT NULL;--> statement-breakpoint
ALTER TABLE `recursive_identity_ledger` ADD `model` text NOT NULL;--> statement-breakpoint
ALTER TABLE `recursive_identity_ledger` ADD `provider_request_id` text;--> statement-breakpoint
ALTER TABLE `recursive_identity_ledger` ADD `latency_ms` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `recursive_identity_ledger` ADD `response_persisted` integer DEFAULT true NOT NULL;