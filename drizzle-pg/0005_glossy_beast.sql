ALTER TABLE "recursive_identity_ledger" ADD COLUMN "provider" text NOT NULL;--> statement-breakpoint
ALTER TABLE "recursive_identity_ledger" ADD COLUMN "model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "recursive_identity_ledger" ADD COLUMN "provider_request_id" text;--> statement-breakpoint
ALTER TABLE "recursive_identity_ledger" ADD COLUMN "latency_ms" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "recursive_identity_ledger" ADD COLUMN "response_persisted" boolean DEFAULT true NOT NULL;