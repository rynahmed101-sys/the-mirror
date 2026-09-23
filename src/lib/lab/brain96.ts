export type BrainTendency = "left" | "right" | "balanced" | "unknown";

export type BrainNode96 = {
  id: string;
  label: string;
  index: number;
  hemisphere: BrainTendency;
  tendency: number;
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

export const BRAIN96_STATUS = "SCHEMA_ONLY_UNTIL_AUTHORITATIVE_TOPOLOGY";

export function validateBrain96(definition: Brain96Definition) {
  if (definition.nodes.length !== 96) {
    throw new Error("Brain definition must contain exactly 96 nodes.");
  }
  const ids = new Set(definition.nodes.map((node) => node.id));
  if (ids.size !== 96) throw new Error("Brain definition contains duplicate node ids.");
  for (const node of definition.nodes) {
    if (!Number.isInteger(node.index) || node.index < 0 || node.index >= 96) {
      throw new Error("Brain node indices must cover 0..95.");
    }
    if (!Number.isFinite(node.tendency) || node.tendency < -1 || node.tendency > 1) {
      throw new Error("Brain tendency must be in [-1,1].");
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
  const left = definition.nodes.filter((node) => tendencyLabel(node.tendency) === "left").length;
  const right = definition.nodes.filter((node) => tendencyLabel(node.tendency) === "right").length;
  const balanced = definition.nodes.length - left - right;
  return { total: 96, left, right, balanced, edgeCount: definition.edges.length };
}
