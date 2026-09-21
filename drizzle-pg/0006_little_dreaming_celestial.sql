CREATE TABLE "recursive_identity_failures" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"iteration_number" integer NOT NULL,
	"attempt_count" integer NOT NULL,
	"validation_error" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'FAILED' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "recursive_identity_failures" ADD CONSTRAINT "recursive_identity_failures_run_id_recursive_identity_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."recursive_identity_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursive_identity_failures" ADD CONSTRAINT "recursive_identity_failures_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;