import { BaseTheory, type TheoryInput } from "./baseTheory";

class PolynomialSquareControl extends BaseTheory {
  readonly metadata = {
    id: "control.polynomial-square",
    name: "Polynomial Square Control",
    domain: "control" as const,
    version: "1.0.0",
    description: "Built-in calibration theory used to prove that the laboratory machinery itself is working: f(x)=x².",
    source: "mirror-native" as const,
  };

  evaluate(input: TheoryInput) {
    const x = Number(input.x);
    if (!Number.isFinite(x)) throw new Error("x must be finite.");
    return x * x;
  }
}

class VectorNormControl extends BaseTheory {
  readonly metadata = {
    id: "mathematics.euclidean-norm",
    name: "Euclidean Vector Norm",
    domain: "mathematics" as const,
    version: "1.0.0",
    description: "Control adapter for vector outputs: ||v||₂.",
    source: "mirror-native" as const,
  };

  evaluate(input: TheoryInput) {
    if (!Array.isArray(input.v) || input.v.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
      throw new Error("v must be a finite numeric array.");
    }
    return Math.sqrt(input.v.reduce((sum, x) => sum + x * x, 0));
  }
}

const theories: BaseTheory[] = [new PolynomialSquareControl(), new VectorNormControl()];

export function listTheories() {
  return theories.map((theory) => theory.metadata);
}

export function getTheory(id: string) {
  return theories.find((theory) => theory.metadata.id === id) ?? null;
}
