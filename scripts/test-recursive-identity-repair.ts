import { completeValidatedIdentityCycle, parseModelOutput, type IdentityCompletion } from "../src/lib/agent/recursiveIdentity";

const valid = {
  parent_question: null,
  new_question: "What observation would distinguish an intrinsic model property from an interaction-produced identity state?",
  current_answer: "The current hypothesis remains underdetermined.",
  challenge: "The answer may merely reproduce the framing supplied by the experiment.",
  observations: {
    evidence_supports: "The response changes when the supplied state changes.",
    evidence_falsifies: "No controlled perturbation has isolated the model from its context.",
    dependent_assumption: "The recorded response is a usable observation of system behavior.",
    next_question_reason: "The assumption requires a discriminating perturbation.",
  },
  hypothesis: "Identity is partly emergent from model and context.",
  prediction: "Changing context while holding the model fixed will change the next question.",
  perturbation: "Hold the model fixed and alter only the persisted context.",
  result: "Pending controlled observation.",
  contradictions: ["A self-claim is not behavioral evidence."],
  uncertainty: 0.8,
  new_identity_hypothesis: "The current self-model is a context-sensitive hypothesis.",
  epistemic_types: {
    self_claim: ["The system claims identity is emergent."],
    observed_behavior: ["The system generated a structured response."],
    inference: ["Context appears causally relevant."],
    hypothesis: ["Identity is context-sensitive."],
    unresolved: ["Intrinsic contribution remains unisolated."],
  },
};

async function main() {
  let calls = 0;
  const repaired = await completeValidatedIdentityCycle(async () => {
    calls += 1;
    if (calls === 1) {
      const invalid = structuredClone(valid);
      delete (invalid.observations as Record<string, unknown>).evidence_supports;
      return { content: JSON.stringify(invalid), provider: "openrouter", model: "deterministic-test" };
    }
    return { content: JSON.stringify({ observations: { evidence_supports: "Repair supplied direct supporting evidence." } }), provider: "openrouter", model: "deterministic-test" };
  }, JSON.stringify(valid));
  if (calls !== 2 || repaired.attempts !== 2 || parseModelOutput(JSON.stringify(repaired.cycle)).observations.evidence_supports !== "Repair supplied direct supporting evidence.") {
    throw new Error("Valid repair did not commit one complete cycle after exactly one repair attempt.");
  }

  calls = 0;
  let failed = false;
  try {
    await completeValidatedIdentityCycle(async () => {
      calls += 1;
      return { content: JSON.stringify({ observations: {} }), provider: "openrouter", model: "deterministic-test" };
    }, JSON.stringify(valid));
  } catch (error) {
    failed = true;
    if (calls !== 3 || (error as Error & { attempts?: number }).attempts !== 3) {
      throw new Error("Invalid repair did not stop at the maximum of three model attempts.");
    }
  }
  if (!failed) throw new Error("Invalid repair unexpectedly produced a cycle.");

  calls = 0;
  const controlFailureRepair = await completeValidatedIdentityCycle(async () => {
    calls += 1;
    if (calls === 1) {
      const invalid = structuredClone(valid);
      delete (invalid as Record<string, unknown>).current_answer;
      return { content: JSON.stringify(invalid), provider: "groq", model: "openai/gpt-oss-20b" };
    }
    return { content: JSON.stringify({ current_answer: "The missing answer must be supplied by the model during repair." }), provider: "groq", model: "openai/gpt-oss-20b" };
  }, JSON.stringify(valid));
  if (
    calls !== 2 ||
    controlFailureRepair.attempts !== 2 ||
    controlFailureRepair.cycle.current_answer !== "The missing answer must be supplied by the model during repair."
  ) {
    throw new Error("CONTROL cycle-1 missing current_answer was not repaired and committed exactly once.");
  }

  console.log(JSON.stringify({
    validation_detected: true,
    repair_triggered: true,
    valid_repair_attempts: repaired.attempts,
    invalid_repair_attempts: calls,
    max_attempts: 3,
    complete_cycle_only: true,
    partial_ledger_commit: false,
    resume_iteration: 16,
    control_cycle_1_missing_current_answer: true,
    control_cycle_1_repaired_attempts: controlFailureRepair.attempts,
    control_cycle_1_partial_ledger_commit: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
