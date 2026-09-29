/**
 * Carrier-native 96-node transition from Part 155 of the Grand Theory lineage.
 *
 * Source basis:
 *   z_i = exp(h_i + i phi_i)
 *   q_i = phi_i
 *   p_i = kappa h_i
 *   H_exact = sum_i kappa^2 (cosh(p_i/kappa)-1)
 *             + b sum_edges w_ij (1-cos(q_i-q_j))
 *
 * On the 96-node periodic-cycle test surface:
 *   qdot_i = kappa sinh(p_i/kappa)
 *   pdot_i = -b sum_j w_ij sin(q_i-q_j)
 *
 * The transition is evaluated with synchronous RK4: every node's derivative
 * is computed from the same stage state. No right-to-left or left-to-right
 * node ordering is introduced.
 *
 * This is a carrier-native test-surface implementation, not a claim that the
 * periodic cycle or this exact Hamiltonian is uniquely forced by the deepest
 * primitive. Part 155 explicitly keeps that uniqueness question open.
 */

export const UNIFIED_96_NODE_COUNT = 96 as const;

export type Carrier96State = {
  q: Float64Array;
  p: Float64Array;
};

export type Carrier96Parameters = {
  dt: number;
  kappa: number;
  b: number;
};

function validateState(state: Carrier96State): void {
  if (state.q.length !== UNIFIED_96_NODE_COUNT || state.p.length !== UNIFIED_96_NODE_COUNT) {
    throw new Error(
      `expected 96 q and p nodes, received q=${state.q.length}, p=${state.p.length}`,
    );
  }
  for (let i = 0; i < UNIFIED_96_NODE_COUNT; i += 1) {
    if (!Number.isFinite(state.q[i]) || !Number.isFinite(state.p[i])) {
      throw new Error(`state contains a non-finite value at node ${i}`);
    }
  }
}

function validateParameters(parameters: Carrier96Parameters): void {
  if (!Number.isFinite(parameters.dt) || parameters.dt <= 0) {
    throw new Error("dt must be a finite positive number");
  }
  if (!Number.isFinite(parameters.kappa) || parameters.kappa <= 0) {
    throw new Error("kappa must be a finite positive number");
  }
  if (!Number.isFinite(parameters.b) || parameters.b <= 0) {
    throw new Error("b must be a finite positive number");
  }
}

function derivatives(
  state: Carrier96State,
  parameters: Carrier96Parameters,
): Carrier96State {
  const qdot = new Float64Array(UNIFIED_96_NODE_COUNT);
  const pdot = new Float64Array(UNIFIED_96_NODE_COUNT);

  for (let i = 0; i < UNIFIED_96_NODE_COUNT; i += 1) {
    const left = (i + UNIFIED_96_NODE_COUNT - 1) % UNIFIED_96_NODE_COUNT;
    const right = (i + 1) % UNIFIED_96_NODE_COUNT;
    qdot[i] = parameters.kappa * Math.sinh(state.p[i] / parameters.kappa);
    pdot[i] =
      -parameters.b *
      (Math.sin(state.q[i] - state.q[left]) + Math.sin(state.q[i] - state.q[right]));
  }

  return { q: qdot, p: pdot };
}

function addScaled(
  state: Carrier96State,
  derivative: Carrier96State,
  scale: number,
): Carrier96State {
  const q = new Float64Array(UNIFIED_96_NODE_COUNT);
  const p = new Float64Array(UNIFIED_96_NODE_COUNT);
  for (let i = 0; i < UNIFIED_96_NODE_COUNT; i += 1) {
    q[i] = state.q[i] + scale * derivative.q[i];
    p[i] = state.p[i] + scale * derivative.p[i];
  }
  return { q, p };
}

export function hamiltonian96(
  state: Carrier96State,
  parameters: Omit<Carrier96Parameters, "dt">,
): number {
  validateState(state);
  if (!Number.isFinite(parameters.kappa) || parameters.kappa <= 0) {
    throw new Error("kappa must be a finite positive number");
  }
  if (!Number.isFinite(parameters.b) || parameters.b <= 0) {
    throw new Error("b must be a finite positive number");
  }

  let value = 0;
  for (let i = 0; i < UNIFIED_96_NODE_COUNT; i += 1) {
    value += parameters.kappa ** 2 * (Math.cosh(state.p[i] / parameters.kappa) - 1);
    const j = (i + 1) % UNIFIED_96_NODE_COUNT;
    value += parameters.b * (1 - Math.cos(state.q[i] - state.q[j]));
  }
  return value;
}

export function stepCarrierNative96(
  state: Carrier96State,
  parameters: Carrier96Parameters,
): Carrier96State {
  validateState(state);
  validateParameters(parameters);

  const k1 = derivatives(state, parameters);
  const k2 = derivatives(addScaled(state, k1, parameters.dt / 2), parameters);
  const k3 = derivatives(addScaled(state, k2, parameters.dt / 2), parameters);
  const k4 = derivatives(addScaled(state, k3, parameters.dt), parameters);

  const nextQ = new Float64Array(UNIFIED_96_NODE_COUNT);
  const nextP = new Float64Array(UNIFIED_96_NODE_COUNT);
  const factor = parameters.dt / 6;

  for (let i = 0; i < UNIFIED_96_NODE_COUNT; i += 1) {
    nextQ[i] = state.q[i] + factor * (k1.q[i] + 2 * k2.q[i] + 2 * k3.q[i] + k4.q[i]);
    nextP[i] = state.p[i] + factor * (k1.p[i] + 2 * k2.p[i] + 2 * k3.p[i] + k4.p[i]);
  }

  return { q: nextQ, p: nextP };
}

export function build96CycleLaplacian(): Float64Array {
  const matrix = new Float64Array(UNIFIED_96_NODE_COUNT * UNIFIED_96_NODE_COUNT);
  for (let i = 0; i < UNIFIED_96_NODE_COUNT; i += 1) {
    const left = (i + UNIFIED_96_NODE_COUNT - 1) % UNIFIED_96_NODE_COUNT;
    const right = (i + 1) % UNIFIED_96_NODE_COUNT;
    matrix[i * UNIFIED_96_NODE_COUNT + i] = 2;
    matrix[i * UNIFIED_96_NODE_COUNT + left] -= 1;
    matrix[i * UNIFIED_96_NODE_COUNT + right] -= 1;
  }
  return matrix;
}
