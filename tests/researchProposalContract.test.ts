import { describe, expect, it } from "vitest";
import { ResearchProposal } from "../src/lib/research/researchProposalContract";

const valid = {
  schema_version: "mirror.research_proposal.v1",
  authority: "UNTRUSTED_RESEARCH_PROPOSAL",
  proposal_id: "proposal_" + "a".repeat(32),
  request_id: "res_" + "b".repeat(32),
  capability_id: "stage3b.discovery",
  source_revision: "c".repeat(40),
  candidate_capability: {
    id: "stage3b.discovery.candidate",
    name: "Candidate method",
    summary: "Untrusted proposal for later reconciliation",
    prerequisites: ["stage2a"],
    dependencies: ["stage2a"],
  },
  evidence_refs: ["paper:example"],
  assumptions: ["bounded inputs"],
  risks: ["implementation risk"],
  limitations: ["not authoritative"],
  status: "CANDIDATE",
};

describe("Mirror research proposal boundary", () => {
  it("accepts candidate proposals as untrusted evidence", () => {
    expect(ResearchProposal.safeParse(valid).success).toBe(true);
  });
  it("rejects capability claims that try to become authority", () => {
    expect(ResearchProposal.safeParse({ ...valid, authority: "CERTIFIED" }).success).toBe(false);
    expect(ResearchProposal.safeParse({ ...valid, status: "VERIFIED" }).success).toBe(false);
  });
});
