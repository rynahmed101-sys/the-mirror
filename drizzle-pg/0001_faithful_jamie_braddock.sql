CREATE TABLE "recursive_identity_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"iteration_id" text NOT NULL,
	"parent_question" text,
	"new_question" text NOT NULL,
	"current_answer" text NOT NULL,
	"challenge" text NOT NULL,
	"observations" text NOT NULL,
	"hypothesis" text NOT NULL,
	"prediction" text NOT NULL,
	"perturbation" text NOT NULL,
	"result" text NOT NULL,
	"contradictions" text NOT NULL,
	"uncertainty" real NOT NULL,
	"new_identity_hypothesis" text NOT NULL,
	"epistemic_types" text NOT NULL,
	"context_snapshot" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "recursive_identity_ledger_iteration_id_unique" UNIQUE("iteration_id")
);
--> statement-breakpoint
CREATE TABLE "recursive_identity_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"status" text DEFAULT 'PAUSED' NOT NULL,
	"max_iterations_per_worker" integer DEFAULT 1 NOT NULL,
	"rate_limit_ms" integer DEFAULT 0 NOT NULL,
	"token_budget" integer,
	"total_iterations" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "recursive_identity_ledger" ADD CONSTRAINT "recursive_identity_ledger_run_id_recursive_identity_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."recursive_identity_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursive_identity_ledger" ADD CONSTRAINT "recursive_identity_ledger_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursive_identity_runs" ADD CONSTRAINT "recursive_identity_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;