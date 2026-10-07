import { describe, expect, it, vi } from "vitest";
import { buildResearchProposal } from "../src/lib/research/researchProposalBuilder";
import { buildProposalLearningHandoff, submitProposalLearningHandoff } from "../src/lib/research/learningHandoff";

const proposal = buildResearchProposal({
  requestId: "research_handoff_1",
  capabilityId: "stage.discovery",
  sourceRevision: "a".repeat(40),
  candidateCapability: {
    id: "candidate.new.method",
    name: "New method",
    summary: "Candidate discovery",
    prerequisites: ["stage1b"],
    dependencies: ["stage1b"],
  },
  evidenceRefs: ["experiment:1"],
  assumptions: ["bounded"],
  risks: ["unverified"],
  limitations: ["candidate"],
});

describe("discovery learning handoff", () => {
  it("builds deterministic untrusted proposals", () => {
    const second = buildResearchProposal({
      requestId: "research_handoff_1",
      capabilityId: "stage.discovery",
      sourceRevision: "a".repeat(40),
      candidateCapability: proposal.candidate_capability,
      evidenceRefs: ["experiment:1"],
      assumptions: ["bounded"],
      risks: ["unverified"],
      limitations: ["candidate"],
    });
    expect(second.proposal_id).toBe(proposal.proposal_id);
    expect(proposal.authority).toBe("UNTRUSTED_RESEARCH_PROPOSAL");
    expect(proposal.status).toBe("CANDIDATE");
  });

  it("keeps the handoff explicitly untrusted", () => {
    const handoff = buildProposalLearningHandoff(proposal, "corr-1");
    expect(handoff.authority).toBe("UNTRUSTED_LEARNING_EVIDENCE");
    expect(handoff.artifact.authority).toBe("UNTRUSTED_RESEARCH_PROPOSAL");
  });

  it("requires an explicit handoff gate", async () => {
    process.env.MIRROR_DISCOVERY_HANDOFF_ENABLED = "0";
    await expect(submitProposalLearningHandoff(proposal, "corr-1")).rejects.toThrow(/disabled/);
  });

  it("uses the dedicated Chanfana learning endpoint", async () => {
    process.env.MIRROR_DISCOVERY_HANDOFF_ENABLED = "1";
    process.env.MIRROR_LEARNING_HANDOFF_ENDPOINT = "http://chanfana.local/worker";
    process.env.MIRROR_LEARNING_HANDOFF_TOKEN = "secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, id: "learn_1" }), { status: 200 }),
    );
    const result = await submitProposalLearningHandoff(proposal, "corr-2");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://chanfana.local/worker/learning",
      expect.objectContaining({ method: "POST" }),
    );
    expect((result as { id: string }).id).toBe("learn_1");
    fetchMock.mockRestore();
  });
});
