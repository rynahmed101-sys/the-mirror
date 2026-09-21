ALTER TABLE "recursive_identity_runs" ADD COLUMN "duplicate_rejections" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recursive_identity_runs" ADD COLUMN "error_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recursive_identity_runs" ADD COLUMN "estimated_cost_usd" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recursive_identity_runs" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "recursive_identity_runs" ADD COLUMN "model" text;