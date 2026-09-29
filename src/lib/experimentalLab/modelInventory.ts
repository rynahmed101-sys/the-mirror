/**
 * Model identity and provenance registry for the Grand Theory / 96-node program.
 *
 * Scientific rule:
 * - model identity is shared across implementations and experiments;
 * - implementation provenance is never erased;
 * - different experiments are not silently promoted to identical dynamics;
 * - absence of a source transition law is recorded as OPEN rather than reconstructed.
 */

export type ModelRelation =
  | "SAME_MODEL_INDEPENDENT_IMPLEMENTATION"
  | "SAME_MODEL_DIFFERENT_EXPERIMENT"
  | "DERIVED_TEST_SURFACE"
  | "UNKNOWN_RELATION";

export type ImplementationRecord = {
  id: string;
  name: string;
  kind:
    | "EVOLVING_96_NODE_IMPLEMENTATION"
    | "HISTORICAL_EXPERIMENTAL_TRAJECTORY"
    | "DERIVATION_TEST_SURFACE"
    | "MODEL_ADJACENT_EXPERIMENTAL_SURFACE";
  provenance: string;
  modelRelation: ModelRelation;
  rawNodeStatesAvailable: boolean;
  sourceTransitionLawAvailable: boolean;
  notes: string;
};

export type ExperimentSurface = {
  id: string;
  name: string;
  provenance: string;
  modelRelation: ModelRelation;
  transitionLawRole:
    | "SOURCE_TRANSITION_CANDIDATE"
    | "CONTROL_SURFACE"
    | "DIFFERENT_EXPERIMENT"
    | "DERIVED_TEST_SURFACE";
  notes: string;
};

export const GRAND_THEORY_96_NODE_MODEL = {
  modelId: "96NODE_UNIFIED_PHYSICAL_INFORMATIONAL_COGNITIVE",
  modelStatus: "CANDIDATE_UNIFIED_DYNAMICAL_FRAMEWORK",
  identityRule: "ONE_MODEL_MULTIPLE_IMPLEMENTATIONS_AND_EXPERIMENTAL_SURFACES",
  architectureSource: {
    name: "96-Node Unified Physical–Informational–Cognitive Model",
    sourcePath: "Pasted markdown(3).md",
    claimsSupported:
      "One coupled state spans physical, informational, computational, observer/self-model sectors; coupling and dynamic topology are part of the candidate framework.",
  },
  implementations: [
    {
      id: "gemini-96node",
      name: "Gemini 96-node calculation",
      kind: "EVOLVING_96_NODE_IMPLEMENTATION",
      provenance: "Independent external implementation reported for the retained 96-node calculation.",
      modelRelation: "SAME_MODEL_INDEPENDENT_IMPLEMENTATION",
      rawNodeStatesAvailable: false,
      sourceTransitionLawAvailable: false,
      notes: "Treat as an independent implementation of the same model until its executable source is recovered; do not substitute inferred equations for the missing source.",
    },
    {
      id: "gpt-96node",
      name: "Independent GPT 96-node calculation",
      kind: "EVOLVING_96_NODE_IMPLEMENTATION",
      provenance: "Independent GPT implementation reported for the retained 96-node calculation.",
      modelRelation: "SAME_MODEL_INDEPENDENT_IMPLEMENTATION",
      rawNodeStatesAvailable: false,
      sourceTransitionLawAvailable: false,
      notes: "Treat as an independent implementation of the same model until its executable source is recovered.",
    },
    {
      id: "layered-metrics-csv",
      name: "96node layered simulation metrics",
      kind: "HISTORICAL_EXPERIMENTAL_TRAJECTORY",
      provenance: "Library record: 96node_layered_simulation_metrics.csv",
      modelRelation: "SAME_MODEL_INDEPENDENT_IMPLEMENTATION",
      rawNodeStatesAvailable: false,
      sourceTransitionLawAvailable: false,
      notes: "Historical trajectory and derived measurements are preserved as evidence from the same model; this record is not a replacement for the transition source.",
    },
    {
      id: "part153-commutator-96node",
      name: "Part 153 primitive commutator 96-node construction",
      kind: "DERIVATION_TEST_SURFACE",
      provenance: "Grand_Theory_Logical_Reconstruction_v154_PRIMITIVE_COMMUTATOR_96NODE.json",
      modelRelation: "DERIVED_TEST_SURFACE",
      rawNodeStatesAvailable: false,
      sourceTransitionLawAvailable: false,
      notes: "Useful algebraic test surface; not asserted to be the microscopic transition law of the evolving simulation.",
    },
    {
      id: "mirror-brain96",
      name: "Mirror brain96 controller",
      kind: "MODEL_ADJACENT_EXPERIMENTAL_SURFACE",
      provenance: "the-mirror/src/lib/lab/brain96.ts",
      modelRelation: "SAME_MODEL_DIFFERENT_EXPERIMENT",
      rawNodeStatesAvailable: false,
      sourceTransitionLawAvailable: false,
      notes: "A 96-node behavioral/control experiment. Preserve separately from the evolving physical 96-node run.",
    },
  ] as readonly ImplementationRecord[],
  experimentSurfaces: [
    {
      id: "mirror-projection-chamber",
      name: "Mirror projection/sandbox chamber",
      provenance: "the-mirror agent projection experiment",
      modelRelation: "SAME_MODEL_DIFFERENT_EXPERIMENT",
      transitionLawRole: "DIFFERENT_EXPERIMENT",
      notes: "A self-observation / agent-projection experiment. It can test projections of the unified model without being declared identical to the layered physical trajectory.",
    },
    {
      id: "part154-carrier-action-gate",
      name: "Part 154 carrier-action derivation gate",
      provenance: "Grand_Theory_Logical_Reconstruction_v154_PRIMITIVE_COMMUTATOR_96NODE.json",
      modelRelation: "DERIVED_TEST_SURFACE",
      transitionLawRole: "DERIVED_TEST_SURFACE",
      notes: "Tracks which analytical links are closed, conditional, or still open.",
    },
  ] as readonly ExperimentSurface[],
  unresolvedSourceGate: {
    status: "OPEN",
    item: "exact_evolving_96node_transition_implementation",
    reason: "The currently accessible Mirror repository does not expose the transition law used to generate the historical layered trajectory.",
    rule: "Do not infer or output-match a transition law and relabel it as source execution.",
  },
} as const;

export const PHYSICAL_EXPERIMENT_GATE = {
  E0_BASELINE_UNPERTURBED: false,
  E1_FIRE_ENERGY_INJECTION: false,
  E2_WATER_TRANSPORT_FLOW: false,
  E3_EARTH_LOAD_DEFORMATION: false,
  E4_AIR_COMPRESSION_WAVE: false,
  E5_VACUUM_NULL: false,
  E6_COLLISION_MERGE_ANNIHILATION: false,
  E7_ROTATION_VORTEX_CIRCULATION: false,
  E8_GRAVITY_LIKE_INTERACTION: false,
  E9_INFORMATION_OBSERVER_PROJECTION: false,
} as const;
