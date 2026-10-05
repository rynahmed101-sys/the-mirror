/**
 * Science Lab — theory contract.
 *
 * Mirror does not own the mathematical/physics calculation engine.
 * A trusted theory adapter implements this contract and delegates its
 * calculation to the Math/Physics suite when appropriate.
 */

export type NumericValue = number | number[];

export type TheoryInput = Record<string, unknown>;

export type TheoryCase = {
  id?: string;
  input: TheoryInput;
  expected: NumericValue;
  label?: string;
};

export type TheoryContext = {
  runId: string;
  caseId: string;
};

export type TheoryMetadata = {
  id: string;
  name: string;
  domain: "mathematics" | "physics" | "control" | "other";
  version: string;
  description: string;
  source: "mirror-native" | "automate-adapter" | "external";
};

export abstract class BaseTheory {
  abstract readonly metadata: TheoryMetadata;
  abstract evaluate(input: TheoryInput, context: TheoryContext): Promise<NumericValue> | NumericValue;

  async validate(input: TheoryInput): Promise<void> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Theory input must be a JSON object.");
    }
  }
}

export function assertFiniteNumeric(value: NumericValue): void {
  const values = Array.isArray(value) ? value : [value];
  if (!values.length || values.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
    throw new Error("Theory output must contain only finite numbers.");
  }
}
