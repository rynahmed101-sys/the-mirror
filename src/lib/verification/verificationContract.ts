import { z } from "zod";

export const VerificationExperimentRequest = z.object({
  schema_version: z.literal("mirror.verification_request.v1"),
  request_id: z.string().regex(/^ver_[0-9a-f]{32}$/),
  action_cycle_id: z.string().min(8).max(128),
  capability_id: z.string().min(1).max(128),
  source_revision: z.string().regex(/^[0-9a-f]{40}$/),
  experiment_type: z.literal("convergence_stability"),
  hypothesis: z.string().min(1).max(2000),
  inputs: z.record(z.string(), z.unknown()),
  assumptions: z.array(z.string().max(2000)).max(100),
  budget: z.object({
    max_precision: z.number().int().min(20).max(120),
    max_truncation: z.number().int().min(3).max(10),
    max_runtime_ms: z.number().int().min(1000).max(120000),
  }),
  requirements: z.array(z.string().max(500)).min(1).max(20),
});

export const VerificationExperimentResult = z.object({
  schema_version: z.literal("mirror.verification_result.v1"),
  authority: z.literal("UNTRUSTED_EXPERIMENTAL_OBSERVATION"),
  experiment_id: z.string().min(8).max(128),
  request_id: z.string().regex(/^ver_[0-9a-f]{32}$/),
  action_cycle_id: z.string().min(8).max(128),
  capability_id: z.string().min(1).max(128),
  source_revision: z.string().regex(/^[0-9a-f]{40}$/),
  status: z.enum(["REPRODUCED", "UNRESOLVED", "CONTRADICTED_OR_DIVERGENT"]),
  hypothesis: z.string().min(1).max(2000),
  inputs: z.record(z.string(), z.unknown()),
  assumptions: z.array(z.string()),
  observations: z.array(z.object({
    precision: z.number().int(),
    truncation: z.string(),
    route: z.string(),
    value: z.string().nullable(),
    relative_disagreement: z.string().nullable(),
    status: z.string(),
  })),
  diagnostics: z.object({
    runtime_ms: z.number().int().nonnegative(),
    max_precision_used: z.number().int().nonnegative(),
    route_disagreement_max: z.string().nullable(),
    source_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    limitations: z.array(z.string()),
  }),
});

export type VerificationExperimentRequestType = z.infer<typeof VerificationExperimentRequest>;
export type VerificationExperimentResultType = z.infer<typeof VerificationExperimentResult>;
