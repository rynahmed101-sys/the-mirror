/**
 * THE MIRROR — Projection run guard
 *
 * Prevents a second expensive projection suite from starting while a recent
 * ACTIVE session is still executing. The helper is intentionally pure so the
 * lifecycle rule stays easy to test independently of the database.
 */

export const SIMULATION_LOCK_MAX_AGE_MS = 20 * 60 * 1000;

export type SimulationRunLock = {
  status: string;
  acquiredAt: Date | number | string | null | undefined;
  agentId?: string;
  suiteId?: string;
  sessionId?: string;
};

function timestamp(value: Date | number | string | null | undefined): number | null {
  if (value instanceof Date) {
    const n = value.getTime();
    return Number.isFinite(n) ? n : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

export function isSimulationLockFresh(
  acquiredAt: Date | number | string | null | undefined,
  nowMs = Date.now(),
  maxAgeMs = SIMULATION_LOCK_MAX_AGE_MS,
): boolean {
  const started = timestamp(acquiredAt);
  if (started === null || !Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return false;
  }

  const age = nowMs - started;
  return age >= 0 && age < maxAgeMs;
}

export function shouldBlockSimulationRun(
  locks: SimulationRunLock[],
  nowMs = Date.now(),
  maxAgeMs = SIMULATION_LOCK_MAX_AGE_MS,
): boolean {
  return locks.some((lock) =>
    lock.status === "ACTIVE" &&
    isSimulationLockFresh(lock.acquiredAt, nowMs, maxAgeMs)
  );
}

export function describeSimulationRunConflict(lock: SimulationRunLock): string {
  const agent = lock.agentId || "selected agent";
  const suite = lock.suiteId ? ` (${lock.suiteId})` : "";
  return `A projection run is already active for ${agent}${suite}. Wait for it to finish or refresh the run status before starting another.`;
}
