import { describe, expect, it } from "vitest";
import { classifyScientificEvidence } from "../src/lib/agent/scientificClassification";

describe("scientific anomaly gate", () => {
  it("keeps agreement as consistent", () => {
    expect(classifyScientificEvidence({
      referenceAgreement: "agree",
      reproducible: true,
      independentlyReplicated: true,
      numericalIntegrity: "passed",
      implementationIntegrity: "passed",
      alternativeExplanationsRemaining: 0,
    }).classification).toBe("consistent");
  });

  it("does not promote an unexplained mismatch directly to new science", () => {
    expect(classifyScientificEvidence({
      referenceAgreement: "disagree",
      reproducible: true,
      independentlyReplicated: false,
      numericalIntegrity: "passed",
      implementationIntegrity: "passed",
      alternativeExplanationsRemaining: 2,
    }).classification).toBe("unresolved_anomaly");
  });

  it("classifies a persistent independently replicated mismatch as potential new science", () => {
    expect(classifyScientificEvidence({
      referenceAgreement: "disagree",
      reproducible: true,
      independentlyReplicated: true,
      numericalIntegrity: "passed",
      implementationIntegrity: "passed",
      alternativeExplanationsRemaining: 0,
    }).classification).toBe("potential_new_science");
  });

  it("takes numerical or implementation failure as a false-anomaly path", () => {
    expect(classifyScientificEvidence({
      referenceAgreement: "disagree",
      reproducible: true,
      independentlyReplicated: true,
      numericalIntegrity: "failed",
      implementationIntegrity: "passed",
      alternativeExplanationsRemaining: 0,
    }).classification).toBe("false_anomaly");
  });

  it("preserves unknown reference comparison as unresolved", () => {
    expect(classifyScientificEvidence({
      referenceAgreement: "unknown",
      reproducible: true,
      independentlyReplicated: false,
      numericalIntegrity: "unknown",
      implementationIntegrity: "passed",
      alternativeExplanationsRemaining: 1,
    }).classification).toBe("unresolved_anomaly");
  });
});
