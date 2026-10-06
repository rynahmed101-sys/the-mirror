import { describe, expect, it } from "vitest";
import { buildResearchProposal } from "../src/lib/research/researchProposalBuilder";

const input = {
  requestId: "research_cycle_1",
  capabilityId: "stage3b.discovery",
  sourceRevision: "c".repeat(40),
  candidateCapability: {
    id: "stage3b.discovery.candidate",
    name: "Candidate method",
    summary: "A reproducible candidate capability generated from Mirror evidence",
    prerequisites: ["stage2a"],
    dependencies: ["stage2a"],
  },
  evidenceRefs: ["paper:example", "experiment:run-1"],
  assumptions: ["bounded inputs"],
  risks: ["implementation risk"],
  limitations: ["unverified candidate"],
};

describe("Mirror research proposal builder", () => {
  it("builds deterministic untrusted proposals", () => {
    const first = buildResearchProposal(input);
    const second = buildResearchProposal({ ...input, evidenceRefs: [...input.evidenceRefs].reverse() });
    expect(first.proposal_id).toBe(second.proposal_id);
    expect(first.authority).toBe("UNTRUSTED_RESEARCH_PROPOSAL");
    expect(first.status).toBe("CANDIDATE");
  });

  it("does not derive authority from evidence packaging", () => {
    const proposal = buildResearchProposal(input);
    expect(proposal.authority).not.toBe("CERTIFIED");
    expect(proposal.status).not.toBe("VERIFIED");
  });
});
