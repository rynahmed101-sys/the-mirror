import { z } from "zod";

export const MirrorFrontierJob = z.object({
  schema_version: z.literal("mirror.frontier_job.v1"),
  request_id: z.string().min(8).max(128),
  action_cycle_id: z.string().min(8).max(128),
  execution_kind: z.literal("mirror_frontier"),
  target: z.object({ mirror_endpoint: z.string().url() }),
  capability: z.object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(500),
    task: z.string().max(4000),
    base_revision: z.string().regex(/^[0-9a-f]{40}$/),
  }),
  mission: z.object({
    repair_required: z.boolean(),
    current_backlog: z.array(z.string()).max(50),
    ledger_frontier: z.array(z.string()).max(50),
    automate_requests: z.array(z.string()).max(50),
    discovery_allowed: z.boolean(),
    ledger_hash: z.string().max(128).nullable(),
    required_action: z.enum(["repair","implement","research","experiment","create_capability_candidate"]).nullable(),
  }),
  limits: z.object({
    max_tool_steps: z.number().int().min(1).max(32),
    deadline_ms: z.number().int().min(1000).max(900000),
    max_response_bytes: z.number().int().min(65536).max(2000000),
  }),
  permissions: z.object({
    network: z.boolean(),
    workspace_write: z.boolean(),
    local_execution: z.boolean(),
    git_commit: z.boolean(),
    remote_git_mutation: z.literal(false),
    canonical_mutation: z.literal(false),
  }),
  provenance: z.object({
    correlation_id: z.string().min(8).max(128),
    parent_ids: z.array(z.string().min(1).max(128)).max(50),
  }),
}).superRefine((job, ctx) => {
  if (job.target.mirror_endpoint.length > 2000) {
    ctx.addIssue({ code: "custom", path: ["target","mirror_endpoint"], message: "endpoint is too long" });
  }
});

export type MirrorFrontierJobType = z.infer<typeof MirrorFrontierJob>;

export function validateMirrorFrontierJob(input: unknown): MirrorFrontierJobType {
  return MirrorFrontierJob.parse(input);
}
