/**
 * Source-grounded partial transition for the unified 96-node model.
 *
 * The unified-model document explicitly defines the relational transport
 * term T_i = sum_j A_ij(X_j - X_i) inside dX_i/dt.
 * It does not specify a microscopic update ordering or an explicit
 * dynamic A_ij(X,t) generator. We therefore use a synchronous
 * explicit-Euler step for this partial source-grounded core:
 * X_i(t+dt) = X_i(t) + dt * T_i(t)
 *
 * Every node reads the same pre-step state. A right-to-left or
 * left-to-right sequential sweep would be a different numerical
 * dynamical rule and is therefore not assumed here.
 */

export const UNIFIED_96_NODE_COUNT = 96 as const;

export type Relational96State = {
  nodes: Float64Array;
};

export type RelationalCoreParameters = {
  dt: number;
  weights: ReadonlyMap<string, number>;
};

function edgeKey(from: number, to: number): string {
  return from + '->' + to;
}

export function step96RelationalCore(
  state: Relational96State,
  parameters: RelationalCoreParameters,
): Relational96State {
  if (state.nodes.length !== UNIFIED_96_NODE_COUNT) {
    throw new Error(
      'expected 96 nodes, received ' + state.nodes.length,
    );
  }
  if (!Number.isFinite(parameters.dt) || parameters.dt <= 0) {
    throw new Error('dt must be a finite positive number');
  }

  const previous = state.nodes;
  const next = new Float64Array(previous.length);

  // Synchronous update: all T_i values are evaluated from previous.
  for (let i = 0; i < UNIFIED_96_NODE_COUNT; i += 1) {
    let transport = 0;
    for (let j = 0; j < UNIFIED_96_NODE_COUNT; j += 1) {
      if (i === j) continue;
      const weight = parameters.weights.get(edgeKey(i, j)) ?? 0;
      if (!Number.isFinite(weight)) {
        throw new Error('non-finite coupling weight at ' + edgeKey(i, j));
      }
      transport += weight * (previous[j] - previous[i]);
    }
    next[i] = previous[i] + parameters.dt * transport;
  }

  return { nodes: next };
}