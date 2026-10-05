/** The contract every trusted mathematical/physical theory adapter implements. */
export type NumericValue = number | number[];
export type TheoryInput = Record<string, unknown>;

export type TheoryCase = {
  id?: string;
  label?: string;
  input: TheoryInput;
  expected: NumericValue;
  tolerance?: number;
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
