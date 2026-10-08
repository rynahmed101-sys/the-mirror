import { describe, expect, it } from "vitest";
import { VerificationExperimentRequest, VerificationExperimentResult } from "../src/lib/verification/verificationContract";

const base = {
  schema_version: "mirror.verification_request.v1",
  request_id: "ver_" + "a".repeat(32),
  action_cycle_id: "cycle_12345678",
  capability_id: "stage1b.improper_integrals",
  source_revision: "a".repeat(40),
  experiment_type: "convergence_stability",
  hypothesis: "tail convergence",
  inputs: { integrand: "1/x", lower: "-oo", upper: "oo" },
  assumptions: [],
  budget: { max_precision: 50, max_truncation: 5, max_runtime_ms: 30000 },
  requirements: ["multiple truncations", "independent route"],
};

describe("Mirror verification boundary", () => {
  it("validates bounded exact-revision requests", () => {
    expect(VerificationExperimentRequest.safeParse(base).success).toBe(true);
  });
  it("rejects oversized or unbound requests", () => {
    expect(VerificationExperimentRequest.safeParse({ ...base, source_revision: "bad" }).success).toBe(false);
    expect(VerificationExperimentRequest.safeParse({ ...base, budget: { ...base.budget, max_precision: 1000 } }).success).toBe(false);
  });
  it("never treats a malformed result as evidence", () => {
    const invalid = {
      schema_version: "mirror.verification_result.v1",
      authority: "CERTIFIED",
      experiment_id: "x",
    };
    expect(VerificationExperimentResult.safeParse(invalid).success).toBe(false);
  });
});
