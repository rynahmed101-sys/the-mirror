"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

type RecordValue = Record<string, unknown>;
type IdentityData = {
  run: RecordValue | null;
  configuration?: RecordValue;
  ledger: RecordValue[];
  workers?: RecordValue[];
  failures?: RecordValue[];
  frontDoor?: RecordValue[];
};

const TARGET_CYCLES = 20;
const asText = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2);
const asObject = (value: unknown): RecordValue => {
  if (typeof value !== "string") return (value && typeof value === "object" ? value : {}) as RecordValue;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};
const asArray = (value: unknown) => {
  const parsed = asObject(value);
  return Array.isArray(value) ? value : Array.isArray(parsed) ? parsed : [];
};
const dateValue = (value: unknown) => {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDate = (value: unknown) => dateValue(value)?.toLocaleString() || "not recorded";
const formatAge = (value: unknown, now: number) => {
  const date = dateValue(value);
  if (!date) return "not recorded";
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
};
const isSecondOrder = (entry: RecordValue) => {
  const text = `${asText(entry.newQuestion)} ${asText(entry.currentAnswer)} ${asText(entry.challenge)}`.toLowerCase();
  return text.includes("question generator") || text.includes("generating questions") || text.includes("mechanism generating");
};

function Metric({ label, value, tone = "text-cyan-100" }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-1 truncate text-sm ${tone}`}>{value}</div>
    </div>
  );
}

function EvidenceBlock({ label, value, tone = "border-slate-800 bg-slate-950/40" }: { label: string; value: unknown; tone?: string }) {
  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{asText(value)}</div>
    </div>
  );
}

export default function IdentityPage() {
  const [data, setData] = useState<IdentityData>({ run: null, ledger: [] });
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [newestIteration, setNewestIteration] = useState<number | null>(null);
  const [endlessRunning, setEndlessRunning] = useState(false);
  const endlessRef = useRef(false);
  const newestRef = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/mirror/identity?agentId=mirror-primary&limit=200", { cache: "no-store" });
      const body = await response.json() as IdentityData & { error?: string; details?: string };
      if (!response.ok) throw new Error(body.details || body.error || "Unable to load identity ledger");
      const ordered = [...(body.ledger || [])].sort((a, b) => Number(a.iterationNumber || 0) - Number(b.iterationNumber || 0));
      const latest = Number(ordered.at(-1)?.iterationNumber || 0) || null;
      setData({ ...body, ledger: ordered });
      setNewestIteration((previous) => latest && latest !== previous ? latest : previous);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 2000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh]);

  useEffect(() => {
    if (newestIteration && newestRef.current) newestRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [newestIteration]);

  const invoke = useCallback(async (action: "start" | "pause" | "worker") => {
    const response = await fetch("/api/mirror/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        agentId: "mirror-primary",
        maxIterationsPerWorker: 1,
        maxTokensPerCycle: 900,
        rateLimitMs: 5000,
      }),
    });
    const body = await response.json() as { error?: string; details?: string };
    if (!response.ok) throw new Error(body.details || body.error || `Unable to ${action} recursion`);
    return body;
  }, []);

  const stopEndless = useCallback(async () => {
    endlessRef.current = false;
    setEndlessRunning(false);
    try {
      await invoke("pause");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [invoke, refresh]);

  const startEndless = useCallback(async () => {
    if (endlessRef.current) return;
    endlessRef.current = true;
    setEndlessRunning(true);
    setError("");
    try {
      await invoke("start");
      while (endlessRef.current) {
        await invoke("worker");
        await refresh();
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
    } catch (cause) {
      endlessRef.current = false;
      setEndlessRunning(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [invoke, refresh]);

  useEffect(() => () => {
    endlessRef.current = false;
  }, []);

  const run = data.run || {};
  const configuration = data.configuration || {};
  const worker = data.workers?.[0];
  const cycles = data.ledger;
  const failures = data.failures || [];
  const frontDoor = data.frontDoor || [];
  const totalInput = cycles.reduce((sum, entry) => sum + Number(entry.inputTokens || 0), 0);
  const totalOutput = cycles.reduce((sum, entry) => sum + Number(entry.outputTokens || 0), 0);
  const contradictionCount = cycles.reduce((sum, entry) => sum + asArray(entry.contradictions).length, 0);
  const repairAttempts = failures.reduce((sum, entry) => sum + Number(entry.attemptCount || 0), 0);
  const heartbeatDate = dateValue(worker?.lastHeartbeatAt);
  const heartbeatAge = heartbeatDate ? now - heartbeatDate.getTime() : Number.POSITIVE_INFINITY;
  const heartbeatHealthy = Boolean(worker && worker.status === "RUNNING" && heartbeatAge <= Number(worker.staleThresholdMs || 300000));
  const rawStatus = String(run.status || "UNKNOWN");
  const status = rawStatus === "RECOVERABLE" ? "STALE" : rawStatus;
  const currentIteration = Number(run.totalIterations || 0);

  const analysis = useMemo(() => {
    const questionTransitions = cycles.slice(1).map((entry, index) => ({
      iteration: Number(entry.iterationNumber || index + 2),
      parent: entry.parentIterationId,
      question: entry.newQuestion,
      verified: Boolean(entry.parentIterationId && entry.responsePersisted && entry.rawResponse),
    }));
    return {
      transitions: questionTransitions,
      secondOrder: cycles.filter(isSecondOrder).map((entry) => entry.iterationNumber),
      perturbations: cycles.filter((entry) => asText(entry.perturbation).trim()).length,
      hypothesisChanges: cycles.slice(1).filter((entry, index) => entry.newIdentityHypothesis !== cycles[index].newIdentityHypothesis).length,
      stateDependent: questionTransitions.filter((transition) => transition.verified).length,
    };
  }, [cycles]);

  return (
    <main className="min-h-screen bg-[#050711] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-400">THE MIRROR / DEVELOPMENT OBSERVER</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Recursive identity live ledger</h1>
            <p className="mt-2 text-sm text-slate-400">Persisted records only. Polling every 2 seconds. The red control runs one bounded worker step at a time and continues until paused.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => void (endlessRunning ? stopEndless() : startEndless())}
              className={`rounded-lg border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.16em] transition ${endlessRunning ? "border-amber-500 bg-amber-600 text-white hover:bg-amber-500" : "border-red-500 bg-red-600 text-white shadow-lg shadow-red-950/40 hover:bg-red-500"}`}
            >
              {endlessRunning ? "Pause recursion" : "Start endless recursion"}
            </button>
            <div className="rounded-full border border-cyan-900 bg-cyan-950/30 px-3 py-1 font-mono text-xs text-cyan-300">LIVE POLL · {formatAge(run.updatedAt, now)}</div>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Metric label="Run ID" value={asText(run.id)} />
          <Metric label="Status" value={status} tone={status === "RUNNING" ? "text-emerald-300" : status === "ERROR" || status === "FAILED" ? "text-red-300" : "text-amber-200"} />
          <Metric label="Model" value={asText(run.model || configuration.model || "not recorded")} />
          <Metric label="Provider" value={asText(run.provider || configuration.provider || "not recorded")} />
          <Metric label="Runtime" value={asText(configuration.runtime || "not recorded")} tone={configuration.runtime === "vercel" ? "text-emerald-300" : "text-amber-200"} />
          <Metric label="Cycle / target" value={`${currentIteration} / ${TARGET_CYCLES}`} />
          <Metric label="Last activity" value={formatAge(run.updatedAt, now)} />
          <Metric label="Worker" value={worker ? asText(worker.workerId) : "none"} />
          <Metric label="Heartbeat" value={worker ? `${asText(worker.status)} · ${formatAge(worker.lastHeartbeatAt, now)}` : "none"} tone={heartbeatHealthy ? "text-emerald-300" : "text-amber-200"} />
          <Metric label="Tokens" value={`${totalInput} in / ${totalOutput} out`} />
          <Metric label="Retries / repairs" value={`${repairAttempts} attempts`} />
          <Metric label="Contradictions" value={contradictionCount} tone="text-amber-200" />
          <Metric label="Duplicate rejects" value={asText(run.duplicateRejections || 0)} />
        </section>

        {error && <div className="mb-5 rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>}

        <section className="mb-8 rounded-xl border border-amber-900/70 bg-amber-950/10 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-mono text-sm uppercase tracking-[0.2em] text-amber-300">Front-door evidence log</h2>
              <p className="mt-1 text-xs text-slate-400">Persisted user inputs and model outputs only. Model claims about memory, tools, or identity are not independently verified here.</p>
            </div>
            <span className="font-mono text-xs text-amber-400">{frontDoor.length} persisted observation(s)</span>
          </div>
          {frontDoor.length === 0 ? (
            <p className="text-sm text-slate-500">No front-door observations recorded for this run.</p>
          ) : (
            <div className="space-y-3">
              {frontDoor.map((entry) => (
                <div key={asText(entry.id)} className="rounded-lg border border-amber-900/50 bg-black/20 p-4">
                  <div className="flex flex-wrap gap-3 font-mono text-[11px] text-amber-200">
                    <span>{asText(entry.eventType)}</span>
                    <span>{formatDate(entry.timestamp)}</span>
                    <span className="text-emerald-300">PERSISTED</span>
                  </div>
                  <EvidenceBlock label="Submitted user input" value={entry.input || "not recorded"} />
                  <div className="mt-3"><EvidenceBlock label="Model response" value={entry.output || "not recorded"} /></div>
                </div>
              ))}
            </div>
          )}
        </section>

        {failures.length > 0 && (
          <section className="mb-8 rounded-xl border border-red-900/70 bg-red-950/20 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm uppercase tracking-[0.2em] text-red-300">Model failures · no committed cycle</h2>
              <span className="font-mono text-xs text-red-400">{failures.length} persisted failure record(s)</span>
            </div>
            <div className="space-y-3">
              {failures.map((failure) => (
                <div key={asText(failure.id)} className="rounded-lg border border-red-900/60 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-red-200">
                    <span>CYCLE {asText(failure.iterationNumber)}</span>
                    <span>MODEL RESPONSE INVALID</span>
                    <span>ATTEMPTS {asText(failure.attemptCount)}/3</span>
                    <span>{asText(failure.status)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-red-100">{asText(failure.validationError)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mb-8 rounded-xl border border-slate-800 bg-[#0b1020] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Commit sequence</h2>
              <p className="font-mono text-xs text-slate-500">Q1 → Q2 → Q3 → … · {currentIteration} / {TARGET_CYCLES} COMMITTED</p>
            </div>
            <div className="font-mono text-xs text-slate-400">time since commit: {formatAge(cycles.at(-1)?.createdAt, now)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-2">
            {cycles.map((entry, index) => (
              <span key={asText(entry.iterationId)} className="flex items-center gap-2 whitespace-nowrap">
                <a href={`#cycle-${asText(entry.iterationNumber || index + 1)}`} className="rounded-full border border-cyan-900 bg-cyan-950/50 px-3 py-1 font-mono text-xs text-cyan-200 hover:border-cyan-400">
                  Q{asText(entry.iterationNumber || index + 1)}
                </a>
                {index < cycles.length - 1 && <span className="text-slate-600">→</span>}
              </span>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          {cycles.map((entry, index) => {
            const next = cycles[index + 1];
            const observation = asObject(entry.observations);
            const contradictions = asArray(entry.contradictions);
            const committed = Boolean(entry.responsePersisted && entry.rawResponse);
            const iteration = Number(entry.iterationNumber || index + 1);
            return (
              <article id={`cycle-${iteration}`} ref={iteration === newestIteration ? newestRef : undefined} key={asText(entry.iterationId)} className={`relative rounded-xl border bg-[#0b1020] p-5 transition ${iteration === newestIteration ? "border-cyan-500/80 shadow-lg shadow-cyan-950/30" : "border-indigo-900/70"}`}>
                <div className="absolute -left-2 top-7 h-4 w-4 rounded-full border-4 border-[#050711] bg-cyan-400" />
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <h2 className="font-mono text-sm font-semibold tracking-widest text-cyan-300">CYCLE {String(iteration).padStart(2, "0")}</h2>
                    <p className="mt-1 font-mono text-xs text-slate-500">{asText(entry.iterationId)} · committed {formatDate(entry.createdAt)}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 font-mono text-xs ${committed ? "border-emerald-900 bg-emerald-950/30 text-emerald-300" : "border-red-900 bg-red-950/30 text-red-300"}`}>
                    RECURSION STATUS · {committed && entry.parentIterationId !== undefined ? "VERIFIED" : "UNVERIFIED"}
                  </span>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <EvidenceBlock label="Question" value={entry.newQuestion} tone="border-cyan-900/70 bg-cyan-950/20" />
                  <EvidenceBlock label="Answer / observation" value={entry.currentAnswer} tone="border-blue-900/60 bg-blue-950/20" />
                  <EvidenceBlock label="Hypothesis" value={entry.hypothesis} tone="border-violet-900/60 bg-violet-950/20" />
                  <EvidenceBlock label="Challenge" value={entry.challenge} tone="border-amber-900/60 bg-amber-950/20" />
                  <EvidenceBlock label="Next question reason" value={observation.next_question_reason} />
                  <EvidenceBlock label="Next question" value={next?.newQuestion || "not yet committed"} tone="border-cyan-900/70 bg-cyan-950/20" />
                  <EvidenceBlock label="Parent" value={entry.parentIterationId || "initial state"} />
                  <EvidenceBlock label="Contradictions" value={contradictions.length ? contradictions : "none recorded"} tone={contradictions.length ? "border-red-900/60 bg-red-950/20" : undefined} />
                  <EvidenceBlock label="Perturbation" value={entry.perturbation} tone="border-orange-900/60 bg-orange-950/20" />
                  <EvidenceBlock label="Provider evidence" value={`${asText(entry.provider)} · ${asText(entry.model)} · ${asText(entry.latencyMs)}ms · ${asText(entry.inputTokens || 0)} in / ${asText(entry.outputTokens || 0)} out · request ${asText(entry.providerRequestId || "not supplied")}`} />
                </div>
                <details className="mt-5 rounded-lg border border-slate-800 bg-black/20 p-4">
                  <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.2em] text-slate-400">Raw record · persisted JSON</summary>
                  <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">{JSON.stringify(entry, null, 2)}</pre>
                </details>
              </article>
            );
          })}
          {!cycles.length && <div className="rounded-xl border border-slate-800 p-10 text-center text-slate-500">No committed cycles yet.</div>}
        </section>

        <section className="mt-8 rounded-xl border border-slate-800 bg-[#0b1020] p-5">
          <h2 className="text-lg font-semibold">Persisted run analysis</h2>
          <p className="mt-1 text-sm text-slate-500">Mechanical counts and relationships derived from the records above; no model interpretation is added here.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Committed" value={`${currentIteration} / ${TARGET_CYCLES}`} />
            <Metric label="Semantic duplicates" value={asText(run.duplicateRejections || 0)} />
            <Metric label="Second-order records" value={analysis.secondOrder.length ? analysis.secondOrder.join(", ") : "none detected"} />
            <Metric label="Hypothesis changes" value={analysis.hypothesisChanges} />
            <Metric label="Perturbations" value={analysis.perturbations} />
            <Metric label="Repair attempts" value={repairAttempts} />
            <Metric label="State-linked transitions" value={`${analysis.stateDependent} / ${analysis.transitions.length}`} />
            <Metric label="Worker recovery records" value={data.workers?.filter((item) => ["STALE", "CRASHED"].includes(String(item.status))).length || 0} />
          </div>
          {analysis.transitions.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="border-b border-slate-800 font-mono uppercase tracking-wider text-slate-500">
                  <tr><th className="p-2">Transition</th><th className="p-2">Canonical parent</th><th className="p-2">Persisted state evidence</th><th className="p-2">Question</th></tr>
                </thead>
                <tbody>
                  {analysis.transitions.map((transition) => (
                    <tr key={transition.iteration} className="border-b border-slate-900 text-slate-300">
                      <td className="p-2 font-mono">Q{transition.iteration - 1} → Q{transition.iteration}</td>
                      <td className="p-2 font-mono text-cyan-300">{asText(transition.parent)}</td>
                      <td className="p-2">{transition.verified ? "response + raw record persisted" : "unverified"}</td>
                      <td className="max-w-md p-2">{asText(transition.question)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
