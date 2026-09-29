import { createHash } from "node:crypto";

export const EXPERIMENTAL_LAB_PROTOCOL_VERSION = "0.1.0" as const;

export type DiscoveryClassification =
  | "OBSERVED"
  | "REPRODUCED"
  | "CROSS_ENGINE"
  | "CROSS_SCALE"
  | "MODEL_DEPENDENT"
  | "DERIVED"
  | "ASSUMED"
  | "INTERPRETATION"
  | "OPEN";

export type ExperimentalScalar = string | number | boolean | null;
export type ExperimentalValue =
  | ExperimentalScalar
  | ExperimentalValue[]
  | { [key: string]: ExperimentalValue }
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

export type NodeDescriptor = {
  id: string;
  [key: string]: unknown;
};

export type EdgeDescriptor = {
  from: string;
  to: string;
  weight?: number;
  [key: string]: unknown;
};

export type TransitionFunction<TState> = (state: TState, parameters: Readonly<Record<string, unknown>>, step: number) => TState;
export type MeasurementFunction<TState> = (state: TState, step: number) => Readonly<Record<string, number | string | boolean>>;
export type EventFunction<TState> = (state: TState, step: number) => ReadonlyArray<Readonly<Record<string, unknown>>>;

export type ModelDefinition<TState> = {
  modelVersion: string;
  engineVersion: string;
  nodes: readonly NodeDescriptor[];
  edges: readonly EdgeDescriptor[];
  coupling: ExperimentalValue | Record<string, unknown>;
  parameters: Readonly<Record<string, unknown>>;
  initialState: TState;
};

export type TrajectoryFrame<TState> = {
  step: number;
  state: TState;
  state_hash: string;
  measurements: Readonly<Record<string, number | string | boolean>>;
  events: ReadonlyArray<Readonly<Record<string, unknown>>>;
};

export type ExperimentRecord<TState> = {
  experiment_id: string;
  protocol_version: typeof EXPERIMENTAL_LAB_PROTOCOL_VERSION;
  model_version: string;
  engine_version: string;
  seed: string | number;
  initial_state: TState;
  parameters: Readonly<Record<string, unknown>>;
  perturbation: unknown | null;
  topology: readonly EdgeDescriptor[];
  coupling: ExperimentalValue | Record<string, unknown>;
  raw_trajectory: readonly TrajectoryFrame<TState>[];
  events: readonly Readonly<Record<string, unknown>>[];
  derived_measurements: Readonly<Record<string, number | string | boolean>>;
  final_state: TState;
  classification: DiscoveryClassification;
};

export type BaselineOptions<TState> = {
  experimentId: string;
  model: ModelDefinition<TState>;
  seed: string | number;
  parameters?: Readonly<Record<string, unknown>>;
  steps: number;
  step: TransitionFunction<TState>;
  perturbation?: unknown | null;
  measure?: MeasurementFunction<TState>;
  events?: EventFunction<TState>;
  classification?: DiscoveryClassification;
};

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (value instanceof Date) return { __type: "Date", value: value.toISOString() };
  if (ArrayBuffer.isView(value)) return { __type: value.constructor.name, value: Array.from(value as unknown as ArrayLike<unknown>) };
  if (value instanceof ArrayBuffer) return { __type: "ArrayBuffer", value: Array.from(new Uint8Array(value)) };
  if (Array.isArray(value)) return value.map(normalize);
  if (value instanceof Map) {
    return { __type: "Map", value: Array.from(value.entries()).map(([k, v]) => [normalize(k), normalize(v)]).sort((a, b) => stableStringify(a[0]).localeCompare(stableStringify(b[0]))) };
  }
  if (value instanceof Set) {
    return { __type: "Set", value: Array.from(value.values()).map(normalize).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))) };
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, normalize(record[key])]));
  }
  throw new TypeError(`Unsupported experimental value type: ${typeof value}`);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

export function cloneState<TState>(state: TState): TState {
  if (typeof structuredClone === "function") return structuredClone(state);
  return JSON.parse(stableStringify(state)) as TState;
}

export function validate96NodeTopology(model: Pick<ModelDefinition<unknown>, "nodes" | "edges">): void {
  if (model.nodes.length !== 96) throw new Error(`96-node invariant violated: expected exactly 96 nodes, received ${model.nodes.length}`);
  const ids = new Set(model.nodes.map((node) => node.id));
  if (ids.size !== 96) throw new Error("96-node invariant violated: node ids are not unique");
  for (const edge of model.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error(`Topology edge references unknown node: ${edge.from}->${edge.to}`);
    if (edge.weight !== undefined && !Number.isFinite(edge.weight)) throw new Error(`Topology edge has non-finite weight: ${edge.from}->${edge.to}`);
  }
}

export function runInstrumentedTrajectory<TState>(args: {
  initialState: TState;
  parameters: Readonly<Record<string, unknown>>;
  steps: number;
  step: TransitionFunction<TState>;
  measure?: MeasurementFunction<TState>;
  events?: EventFunction<TState>;
}): readonly TrajectoryFrame<TState>[] {
  if (!Number.isInteger(args.steps) || args.steps < 0) throw new Error("steps must be a non-negative integer");
  const frames: TrajectoryFrame<TState>[] = [];
  let state = cloneState(args.initialState);

  for (let step = 0; step <= args.steps; step += 1) {
    frames.push({
      step,
      state: cloneState(state),
      state_hash: sha256(state),
      measurements: args.measure ? { ...args.measure(state, step) } : {},
      events: args.events ? args.events(state, step).map((event) => ({ ...event })) : [],
    });
    if (step < args.steps) state = args.step(state, args.parameters, step);
  }
  return frames;
}

export function replayDeterministic<TState>(args: {
  initialState: TState;
  parameters: Readonly<Record<string, unknown>>;
  steps: number;
  step: TransitionFunction<TState>;
}): { deterministic: true; trajectory_hashes: readonly string[]; final_state_hash: string } {
  const first = runInstrumentedTrajectory(args);
  const second = runInstrumentedTrajectory(args);
  const firstHashes = first.map((frame) => frame.state_hash);
  const secondHashes = second.map((frame) => frame.state_hash);
  if (firstHashes.length !== secondHashes.length || firstHashes.some((hash, index) => hash !== secondHashes[index])) {
    throw new Error("C1 deterministic replay failed: identical inputs produced different trajectory hashes");
  }
  return { deterministic: true, trajectory_hashes: firstHashes, final_state_hash: firstHashes[firstHashes.length - 1] };
}

export function parameterMatrix(axes: Readonly<Record<string, readonly unknown[]>>): readonly Readonly<Record<string, unknown>>[] {
  const entries = Object.entries(axes).sort(([a], [b]) => a.localeCompare(b));
  if (entries.some(([, values]) => values.length === 0)) return [];
  let rows: Readonly<Record<string, unknown>>[] = [{}];
  for (const [key, values] of entries) {
    const next: Readonly<Record<string, unknown>>[] = [];
    for (const row of rows) {
      for (const value of values) next.push({ ...row, [key]: value });
    }
    rows = next;
  }
  return rows;
}

export function runE0Baseline<TState>(options: BaselineOptions<TState>): ExperimentRecord<TState> {
  validate96NodeTopology(options.model);
  if (!Number.isInteger(options.steps) || options.steps < 0) throw new Error("E0 steps must be a non-negative integer");

  const parameters = { ...options.model.parameters, ...(options.parameters ?? {}) };
  const trajectory = runInstrumentedTrajectory({
    initialState: options.model.initialState,
    parameters,
    steps: options.steps,
    step: options.step,
    measure: options.measure,
    events: options.events,
  });
  const finalFrame = trajectory[trajectory.length - 1];

  return {
    experiment_id: options.experimentId,
    protocol_version: EXPERIMENTAL_LAB_PROTOCOL_VERSION,
    model_version: options.model.modelVersion,
    engine_version: options.model.engineVersion,
    seed: options.seed,
    initial_state: cloneState(options.model.initialState),
    parameters,
    perturbation: options.perturbation ?? null,
    topology: options.model.edges.map((edge) => ({ ...edge })),
    coupling: cloneState(options.model.coupling),
    raw_trajectory: trajectory,
    events: trajectory.flatMap((frame) => frame.events.map((event) => ({ ...event, step: frame.step }))),
    derived_measurements: { ...finalFrame.measurements },
    final_state: cloneState(finalFrame.state),
    classification: options.classification ?? "OBSERVED",
  };
}

export function experimentFingerprint<TState>(record: ExperimentRecord<TState>): string {
  return sha256({
    experiment_id: record.experiment_id,
    protocol_version: record.protocol_version,
    model_version: record.model_version,
    engine_version: record.engine_version,
    seed: record.seed,
    initial_state: record.initial_state,
    parameters: record.parameters,
    perturbation: record.perturbation,
    topology: record.topology,
    coupling: record.coupling,
    raw_trajectory: record.raw_trajectory,
    events: record.events,
    derived_measurements: record.derived_measurements,
    final_state: record.final_state,
    classification: record.classification,
  });
}
