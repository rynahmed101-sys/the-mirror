CREATE TABLE "recursive_identity_workers" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"last_heartbeat_at" timestamp NOT NULL,
	"started_at" timestamp NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"stale_threshold_ms" integer DEFAULT 300000 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recursive_identity_ledger" ADD COLUMN "iteration_number" integer;--> statement-breakpoint
ALTER TABLE "recursive_identity_ledger" ADD COLUMN "parent_iteration_id" text;--> statement-breakpoint
ALTER TABLE "recursive_identity_workers" ADD CONSTRAINT "recursive_identity_workers_run_id_recursive_identity_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."recursive_identity_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursive_identity_workers" ADD CONSTRAINT "recursive_identity_workers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recursive_identity_ledger_run_iteration_idx" ON "recursive_identity_ledger" USING btree ("run_id","iteration_number");