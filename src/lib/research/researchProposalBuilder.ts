import { createHash } from "node:crypto";
import { ResearchProposal, type ResearchProposalType } from "./researchProposalContract";

export interface ResearchProposalInput {
  requestId: string;
  capabilityId: string;
  sourceRevision: string | null;
  candidateCapability: ResearchProposalType["candidate_capability"];
  evidenceRefs: string[];
  assumptions: string[];
  risks: string[];
  limitations: string[];
}

function stableProposalId(input: ResearchProposalInput): string {
  const canonical = JSON.stringify({
    request_id: input.requestId,
    capability_id: input.capabilityId,
    source_revision: input.sourceRevision,
    candidate_capability: input.candidateCapability,
    evidence_refs: [...input.evidenceRefs].sort(),
    assumptions: [...input.assumptions].sort(),
    risks: [...input.risks].sort(),
    limitations: [...input.limitations].sort(),
  });
  return "proposal_" + createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 32);
}

/**
 * Build a candidate capability proposal from Mirror observations.
 *
 * This function is intentionally only a packaging step. It does not decide
 * whether the proposed capability is correct, useful, novel, or authoritative.
 * Those decisions belong downstream to verification and Automate.
 */
export function buildResearchProposal(input: ResearchProposalInput): ResearchProposalType {
  return ResearchProposal.parse({
    schema_version: "mirror.research_proposal.v1",
    authority: "UNTRUSTED_RESEARCH_PROPOSAL",
    proposal_id: stableProposalId(input),
    request_id: input.requestId,
    capability_id: input.capabilityId,
    source_revision: input.sourceRevision,
    candidate_capability: input.candidateCapability,
    evidence_refs: [...input.evidenceRefs],
    assumptions: [...input.assumptions],
    risks: [...input.risks],
    limitations: [...input.limitations],
    status: "CANDIDATE",
  });
}
