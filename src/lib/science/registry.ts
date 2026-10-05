import { BaseTheory, type TheoryInput } from "./baseTheory";

class PolynomialSquareControl extends BaseTheory {
  readonly metadata = {
    id: "control.polynomial-square",
    name: "Polynomial Square Control",
    domain: "control" as const,
    version: "1.0.0",
    description: "Reference control used to verify the laboratory evaluator: f(x) = x².",
    source: "mirror-native" as const,
  };

  evaluate(input: TheoryInput) {
    const x = Number(input.x);
    if (!Number.isFinite(x)) throw new Error("Input x must be finite.");
    return x * x;
  }
}

const theories: BaseTheory[] = [new PolynomialSquareControl()];

export function listTheories() { return theories.map((theory) => theory.metadata); }
export function getTheory(id: string) { return theories.find((theory) => theory.metadata.id === id) ?? null; }
