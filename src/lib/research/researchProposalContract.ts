import { z } from "zod";

export const ResearchProposal = z.object({
  schema_version: z.literal("mirror.research_proposal.v1"),
  authority: z.literal("UNTRUSTED_RESEARCH_PROPOSAL"),
  proposal_id: z.string().regex(/^proposal_[0-9a-f]{32}$/),
  request_id: z.string().min(8).max(128),
  capability_id: z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/),
  source_revision: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
  candidate_capability: z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_.-]*$/),
    name: z.string().min(1).max(300),
    summary: z.string().min(1).max(4000),
    prerequisites: z.array(z.string().max(500)).max(50),
    dependencies: z.array(z.string().max(128)).max(50),
  }),
  evidence_refs: z.array(z.string().max(500)).min(1).max(100),
  assumptions: z.array(z.string().max(2000)).max(100),
  risks: z.array(z.string().max(2000)).max(100),
  limitations: z.array(z.string().max(2000)).max(100),
  status: z.literal("CANDIDATE"),
});

export type ResearchProposalType = z.infer<typeof ResearchProposal>;
