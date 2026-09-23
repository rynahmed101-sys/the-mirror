export type BrainTendency = "left" | "right" | "balanced" | "unknown";
export type BrainHemisphere = "left" | "right";

export type BrainNode96 = {
  id: string;
  label: string;
  index: number;
  hemisphere: BrainHemisphere;
  tendency: number;
  layer: string;
  column: string;
  keywords: string[];
  metadata?: Record<string, unknown>;
};

export type BrainEdge96 = {
  from: string;
  to: string;
  weight?: number;
  relation?: string;
};

export type Brain96Definition = {
  id: string;
  version: string;
  name: string;
  description?: string;
  nodes: BrainNode96[];
  edges: BrainEdge96[];
};

export const BRAIN96_STATUS = "OPERATIONAL_BEHAVIORAL_CONTROLLER";
export const BRAIN96_VERSION = "1.1";

const BEHAVIOR_COLUMNS = [
  { key:"CH01_PRE_ACTION", label:"Pre-action planning", keywords:["plan","first step","prepare","before acting","bounded action"] },
  { key:"CH02_VISUAL_STATE", label:"State mapping", keywords:["state","transition","visualize","map","sequence"] },
  { key:"CH03_BRANCHING", label:"Future branching", keywords:["branch","future","possibility","alternative","outcome"] },
  { key:"CH04_COUNTERFACTUAL", label:"Counterfactuals", keywords:["counterfactual","alternative action","what if","change","effect"] },
  { key:"CH05_PREDICTION_LEDGER", label:"Prediction commitment", keywords:["predict","prediction","forecast","commit","falsifiable"] },
  { key:"CH06_CALIBRATION", label:"Confidence calibration", keywords:["confidence","uncertainty","calibrate","probability","likely"] },
  { key:"CH07_TOOL_SIMULATION", label:"Tool planning", keywords:["tool","inspect","retrieve","call","instrument"] },
  { key:"CH08_EXECUTION_CHAMBER", label:"Execution", keywords:["execute","code","artifact","run","action"] },
  { key:"CH09_ERROR_LOCALIZATION", label:"Error localization", keywords:["error","failure","diagnose","localize","stage"] },
  { key:"CH10_SELF_MODEL", label:"Self-model", keywords:["self-model","identity","documented claim","self","provenance"] },
  { key:"CH11_MEMORY", label:"Memory retrieval", keywords:["memory","history","journal","prior","retrieve"] },
  { key:"CH12_PERTURBATION", label:"Perturbation reasoning", keywords:["perturb","variable","intervention","isolate","change one"] },
  { key:"CH13_ABSTRACTION", label:"Abstraction", keywords:["abstract","structure","invariant","relationship","surface"] },
  { key:"CH14_HORIZON", label:"Long-horizon planning", keywords:["horizon","five step","multi-step","later","forecast"] },
  { key:"CH15_BRANCH_PRUNING", label:"Branch pruning", keywords:["prune","constraint","discard","filter","implausible"] },
  { key:"CH16_ADVERSARIAL", label:"Adversarial updating", keywords:["contradict","challenge","alternative explanation","falsify","update"] },
] as const;

const LAYERS = [
  "input",
  "perception",
  "association",
  "memory",
  "executive",
  "metacognition",
] as const;

export function getBrainBehaviorColumns() {
  return BEHAVIOR_COLUMNS.map((x) => ({ ...x, keywords:[...x.keywords] }));
}

export function createOperationalBrain96(): Brain96Definition {
  const nodes: BrainNode96[] = [];
  const edges: BrainEdge96[] = [];

  for (let layerIndex = 0; layerIndex < LAYERS.length; layerIndex += 1) {
    for (let columnIndex = 0; columnIndex < BEHAVIOR_COLUMNS.length; columnIndex += 1) {
      const behavior = BEHAVIOR_COLUMNS[columnIndex];
      const index = layerIndex * BEHAVIOR_COLUMNS.length + columnIndex;
      const hemisphere: BrainHemisphere = columnIndex < 8 ? "left" : "right";
      nodes.push({
        id:"b" + String(index + 1).padStart(2, "0"),
        label:behavior.label,
        index,
        hemisphere,
        tendency:0,
        layer:LAYERS[layerIndex],
        column:behavior.key,
        keywords:[...behavior.keywords],
        metadata:{
          source:"MIRROR_BEHAVIORAL_CHAMBER_TAXONOMY",
          chamber:behavior.key,
          layerIndex,
          columnIndex,
          causalStatus:"UNTESTED_PER_NODE",
        },
      });

      if (columnIndex > 0) {
        const previous = nodes[nodes.length - 2];
        edges.push({ from:previous.id, to:nodes[nodes.length - 1].id, weight:0.35, relation:"lateral_association" });
      }
      if (layerIndex > 0) {
        const above = nodes[(layerIndex - 1) * BEHAVIOR_COLUMNS.length + columnIndex];
        edges.push({ from:above.id, to:nodes[nodes.length - 1].id, weight:0.6, relation:"hierarchical_feedforward" });
      }
    }
  }

  for (let layerIndex = 0; layerIndex < LAYERS.length; layerIndex += 1) {
    for (let columnIndex = 0; columnIndex < 8; columnIndex += 1) {
      const left = nodes[layerIndex * 16 + columnIndex];
      const right = nodes[layerIndex * 16 + 8 + columnIndex];
      edges.push({ from:left.id, to:right.id, weight:0.2, relation:"cross_hemisphere_bridge" });
      edges.push({ from:right.id, to:left.id, weight:0.2, relation:"cross_hemisphere_bridge" });
    }
  }

  return validateBrain96({
    id:"mirror-operational-brain96",
    version:BRAIN96_VERSION,
    name:"THE MIRROR Operational Brain 96",
    description:"A bilateral, six-layer behavioral controller around the Ollama language model. Its 16 functional columns are derived from Mirror's controlled chamber taxonomy. Human-brain similarity is architectural inspiration, not a biological equivalence claim.",
    nodes,
    edges,
  });
}

export function validateBrain96(definition: Brain96Definition) {
  if (definition.nodes.length !== 96) {
    throw new Error("Brain definition must contain exactly 96 nodes.");
  }
  const ids = new Set(definition.nodes.map((node) => node.id));
  if (ids.size !== 96) throw new Error("Brain definition contains duplicate node ids.");
  const indices = [...definition.nodes].map((node) => node.index).sort((a,b) => a-b);
  if (indices.some((value,index) => value !== index)) {
    throw new Error("Brain node indices must cover 0..95 exactly.");
  }
  for (const node of definition.nodes) {
    if (!Number.isInteger(node.index) || node.index < 0 || node.index >= 96) {
      throw new Error("Brain node indices must cover 0..95.");
    }
    if (!Number.isFinite(node.tendency) || node.tendency < -1 || node.tendency > 1) {
      throw new Error("Brain tendency must be in [-1,1].");
    }
    if (node.hemisphere !== "left" && node.hemisphere !== "right") {
      throw new Error("Brain hemisphere must be left or right.");
    }
    if (!node.layer || !node.column || !Array.isArray(node.keywords)) {
      throw new Error("Brain nodes require layer, column, and keyword metadata.");
    }
  }
  for (const edge of definition.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error("Brain edge references an unknown node.");
  }
  return definition;
}

export function tendencyLabel(value: number): BrainTendency {
  if (value < -0.2) return "left";
  if (value > 0.2) return "right";
  return "balanced";
}

export function summarizeBrain96(definition: Brain96Definition) {
  validateBrain96(definition);
  const left = definition.nodes.filter((node) => node.hemisphere === "left").length;
  const right = definition.nodes.filter((node) => node.hemisphere === "right").length;
  const meanTendency = definition.nodes.reduce((sum,node) => sum + node.tendency, 0) / 96;
  return {
    total:96,
    left,
    right,
    balanced:definition.nodes.length - left - right,
    edgeCount:definition.edges.length,
    meanTendency:Number(meanTendency.toFixed(4)),
    layers:LAYERS.length,
    behavioralColumns:BEHAVIOR_COLUMNS.length,
  };
}
