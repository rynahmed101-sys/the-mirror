/**
 * Scientific anomaly classification.
 *
 * Classification is evidence-state, not a theory verdict. In particular,
 * disagreement with a reference theory is never sufficient by itself to
 * classify an observation as new science.
 */

export type ScientificClassification =
  | "consistent"
  | "unresolved_anomaly"
  | "potential_new_science"
  | "false_anomaly";

export interface ScientificEvidenceState {
  referenceAgreement: "agree" | "disagree" | "unknown";
  reproducible: boolean;
  independentlyReplicated: boolean;
  numericalIntegrity: "passed" | "failed" | "unknown";
  implementationIntegrity: "passed" | "failed" | "unknown";
  alternativeExplanationsRemaining: number;
}

export interface ScientificClassificationResult {
  classification: ScientificClassification;
  investigationRequired: boolean;
  rationale: string;
}

/**
 * Classify the current evidence state conservatively.
 *
 * Numerical or implementation failure takes precedence because an apparent
 * anomaly cannot be scientifically interpreted until the instrument itself is
 * shown to be functioning adequately.
 */
export function classifyScientificEvidence(
  evidence: ScientificEvidenceState,
): ScientificClassificationResult {
  if (evidence.numericalIntegrity === "failed" || evidence.implementationIntegrity === "failed") {
    return {
      classification: "false_anomaly",
      investigationRequired: true,
      rationale: "The observed discrepancy has a known numerical or implementation integrity failure.",
    };
  }

  if (evidence.referenceAgreement === "agree") {
    return {
      classification: "consistent",
      investigationRequired: false,
      rationale: "The observation agrees with the selected reference theory under the recorded evidence conditions.",
    };
  }

  if (
    evidence.referenceAgreement === "disagree" &&
    evidence.reproducible &&
    evidence.independentlyReplicated &&
    evidence.numericalIntegrity === "passed" &&
    evidence.implementationIntegrity === "passed" &&
    evidence.alternativeExplanationsRemaining === 0
  ) {
    return {
      classification: "potential_new_science",
      investigationRequired: true,
      rationale: "The disagreement survives reproducibility, independent replication, numerical integrity checks, implementation checks, and current alternative explanations.",
    };
  }

  if (evidence.referenceAgreement === "disagree") {
    return {
      classification: "unresolved_anomaly",
      investigationRequired: true,
      rationale: "The observation disagrees with the reference theory but the evidence is not yet sufficient to distinguish a genuine anomaly from an alternative explanation.",
    };
  }

  return {
    classification: "unresolved_anomaly",
    investigationRequired: true,
    rationale: "The available evidence does not establish agreement or a sufficiently characterized disagreement.",
  };
}
