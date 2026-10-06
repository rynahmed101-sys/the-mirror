import { describe, expect, it, vi } from "vitest";

const validBody = {
  requestId: "research_12345678",
  capabilityId: "stage.discovery",
  sourceRevision: "c".repeat(40),
  candidateCapability: {
    id: "candidate.new.method",
    name: "New method",
    summary: "Candidate capability",
    prerequisites: ["stage1b"],
    dependencies: ["stage1b"],
  },
  evidenceRefs: ["experiment:1"],
  assumptions: ["bounded inputs"],
  risks: ["unverified"],
  limitations: ["candidate only"],
};

describe("Mirror discovery proposal endpoint", () => {
  it("is disabled unless the explicit discovery gate and token exist", async () => {
    process.env.MIRROR_DISCOVERY_ENABLED = "0";
    process.env.MIRROR_DISCOVERY_JOB_TOKEN = "secret";
    vi.resetModules();
    const mod = await import("../src/app/api/research/proposal/route");
    const req = new Request("http://mirror.local/api/research/proposal", {
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: JSON.stringify(validBody),
    });
    const response = await mod.POST(req);
    expect(response.status).toBe(403);
  });

  it("returns only a candidate proposal when enabled and authorized", async () => {
    process.env.MIRROR_DISCOVERY_ENABLED = "1";
    process.env.MIRROR_DISCOVERY_JOB_TOKEN = "secret";
    vi.resetModules();
    const mod = await import("../src/app/api/research/proposal/route");
    const req = new Request("http://mirror.local/api/research/proposal", {
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: JSON.stringify(validBody),
    });
    const response = await mod.POST(req);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.authority).toBe("UNTRUSTED_RESEARCH_PROPOSAL");
    expect(payload.status).toBe("CANDIDATE");
  });
});
