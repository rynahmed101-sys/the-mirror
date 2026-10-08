import { describe, expect, it, vi } from "vitest";
import { buildResearchProposal } from "../src/lib/research/researchProposalBuilder";
import {
  buildProposalLearningHandoff,
  submitProposalLearningHandoff,
} from "../src/lib/research/learningHandoff";

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

describe("Mirror learning handoff", () => {
  it("creates an explicitly untrusted durable envelope", () => {
    const handoff = buildProposalLearningHandoff(proposal, "corr-1");
    expect(handoff.schema_version).toBe("automate.learning_handoff.v1");
    expect(handoff.authority).toBe("UNTRUSTED_LEARNING_EVIDENCE");
    expect(handoff.artifact_type).toBe("research_proposal");
    expect(handoff.artifact.proposal_id).toBe(proposal.proposal_id);
  });

  it("refuses submission when the handoff gate is off", async () => {
    process.env.MIRROR_DISCOVERY_HANDOFF_ENABLED = "0";
    await expect(
      submitProposalLearningHandoff(proposal, "corr-1"),
    ).rejects.toThrow(/disabled/);
  });

  it("submits only when explicitly enabled", async () => {
    process.env.MIRROR_DISCOVERY_HANDOFF_ENABLED = "1";
    process.env.MIRROR_LEARNING_HANDOFF_ENDPOINT = "http://chanfana.local/worker/v1";
    process.env.MIRROR_LEARNING_HANDOFF_TOKEN = "secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, jobId: "job_1" }), { status: 200 }),
    );
    const result = await submitProposalLearningHandoff(proposal, "corr-2");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://chanfana.local/worker/v1/jobs",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect((result as { jobId: string }).jobId).toBe("job_1");
    fetchMock.mockRestore();
  });
});
