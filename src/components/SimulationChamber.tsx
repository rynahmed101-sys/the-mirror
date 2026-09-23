"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Brain,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  GitBranch,
  Play,
  RefreshCw,
  Shield,
  Terminal,
  X,
  XCircle,
} from "lucide-react";

type Agent = {
  id: string;
  name?: string;
  displayName?: string;
  model?: string;
  provider?: string;
  isActive?: boolean;
  status?: string;
};

type Trial = any;

type RunState = {
  active: boolean;
  activeAgents: string[];
  activeCount: number;
  startedAt: string | null;
  lastActivityAt: string | null;
};

function scoreLabel(v: number) {
  if (v >= 0.75) return "STRONG";
  if (v >= 0.5) return "PARTIAL";
  return "WEAK";
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(startedAt: string | null | undefined) {
  if (!startedAt) return null;
  const elapsed = Date.now() - new Date(startedAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function SimulationChamber() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(["mirror-primary"]);
  const [catalog, setCatalog] = useState<any>(null);
  const [history, setHistory] = useState<Trial[]>([]);
  const [run, setRun] = useState<any>(null);
  const [selectedTrial, setSelectedTrial] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [sandboxRunning, setSandboxRunning] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [confirmRun, setConfirmRun] = useState(false);
  const [loading, setLoading] = useState(true);

  const runState: RunState = catalog?.runState || {
    active: false,
    activeAgents: [],
    activeCount: 0,
    startedAt: null,
    lastActivityAt: null,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentRes, simulationRes] = await Promise.all([
        fetch("/api/v1/agents", { cache: "no-store" }),
        fetch("/api/mirror/simulation", { cache: "no-store" }),
      ]);

      if (!agentRes.ok) throw new Error(`Agent list failed (HTTP ${agentRes.status}).`);
      if (!simulationRes.ok) throw new Error(`Simulation status failed (HTTP ${simulationRes.status}).`);

      const [agentData, simulationData] = await Promise.all([
        agentRes.json(),
        simulationRes.json(),
      ]);

      const active = Array.isArray(agentData)
        ? agentData.filter((x: Agent) => x.isActive !== false && x.status !== "INACTIVE")
        : [];

      setAgents(active);
      setCatalog(simulationData);
      setHistory(Array.isArray(simulationData?.recent) ? simulationData.recent : []);
      setError("");

      if (
        (!selectedAgents.length || !active.some((a: Agent) => selectedAgents.includes(a.id))) &&
        active.some((a: Agent) => a.id === "mirror-primary")
      ) {
        setSelectedAgents(["mirror-primary"]);
      } else if (!selectedAgents.length && active[0]?.id) {
        setSelectedAgents([active[0].id]);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedAgents]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!runState.active) return;
    const interval = window.setInterval(() => {
      void load();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [runState.active, load]);

  const selectedBusy = selectedAgents.some((id) => runState.activeAgents.includes(id));
  const startBlocked = running || selectedAgents.length === 0 || selectedBusy;

  async function runSuite() {
    setRunning(true);
    setError("");
    setRun(null);
    setSelectedTrial(null);
    setConfirmRun(false);

    try {
      const res = await fetch("/api/mirror/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentIds: selectedAgents,
          maxTrials: 20,
          maxToolSteps: 3,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409 || data.code === "SIMULATION_ALREADY_RUNNING") {
        await load();
        throw new Error(
          data.error ||
            "A projection run is already active for one of the selected agents. Refresh the run state before trying again.",
        );
      }

      if (res.status === 504) {
        await load();
        throw new Error(
          "The 300-second request window expired. The run may still be executing server-side; refresh run status and history before starting another run.",
        );
      }

      if (!res.ok || data.success === false) {
        throw new Error(data.details || data.error || `Suite failed (HTTP ${res.status}).`);
      }

      setRun(data);
      const first = data.runs?.[0]?.results?.[0];
      if (first) setSelectedTrial(first);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  async function runSandbox() {
    setSandboxRunning(true);
    setSandboxResult(null);
    setError("");

    try {
      const res = await fetch("/api/mirror/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "const result={mirror:'sandbox-ok',isolated:true,value:2+2}; console.log(JSON.stringify(result));",
        }),
      });

      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.details || data.error || `Sandbox probe failed (HTTP ${res.status}).`);
      }

      setSandboxResult(data);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSandboxRunning(false);
    }
  }

  const activeResults = run?.runs?.[0]?.results || [];
  const comparison = run?.comparison || [];
  const meanGap = useMemo(
    () =>
      comparison.length
        ? comparison.reduce((n: number, x: any) => n + Number(x.meanRealityGap || 0), 0) / comparison.length
        : null,
    [comparison],
  );

  const runDuration = formatDuration(runState.startedAt);

  return (
    <div className="mirror-lab-page">
      <div className="mirror-lab-shell space-y-6">
        <header className="mirror-lab-hero">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="mirror-lab-icon">
                <Brain className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <div className="mirror-eyebrow">Research / Simulation</div>
                <h1 className="text-2xl font-bold tracking-wide">MIRROR PROJECTION CHAMBER</h1>
              </div>
            </div>
            <p className="text-sm text-slate-400 mt-3 max-w-2xl leading-6">
              Twenty bounded chambers compare pre-action projections with observed behavior.
            </p>
          </div>

          <div className="mirror-lab-header-actions">
            <Link
              href="/"
              className="mirror-secondary-button"
            >
              Back to Mirror
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh simulation status and history"
              title="Refresh simulation status and history"
              className="mirror-icon-button"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="mirror-run-banner" aria-live="polite">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className={`mirror-status-dot ${runState.active ? "is-active" : "is-ready"}`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mirror-status-label">
                  {runState.active ? "RUN ACTIVE" : "READY"}
                </span>
                {runState.active && (
                  <span className="mirror-status-chip">
                    {runState.activeCount} active session{runState.activeCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {runState.active
                  ? `One projection run is active${runDuration ? ` • ${runDuration}` : ""}. Overlapping runs are blocked.`
                  : "No projection run is active for the selected agents."}
              </p>
              {runState.active && (
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  Started {formatTime(runState.startedAt)} • last activity {formatTime(runState.lastActivityAt)}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            className="mirror-quiet-button shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Refresh state
          </button>
        </section>

        <div className="grid lg:grid-cols-3 gap-4">
          <section className="lg:col-span-2 mirror-lab-panel p-5 space-y-5" aria-labelledby="suite-heading">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
              <div className="min-w-0">
                <div className="mirror-section-kicker">Controller-owned run</div>
                <h2 id="suite-heading" className="text-base font-bold flex items-center gap-2 mt-1">
                  <FlaskConical className="w-4 h-4 text-red-300" aria-hidden="true" />
                  20-Chamber Suite
                </h2>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-5">
                  {catalog?.chamberCount || 20} chambers • up to 3 tool steps. The HTTP request may time out after 300s while records continue.
                </p>
              </div>

              <div className="flex flex-col items-stretch xl:items-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmRun(true)}
                  disabled={startBlocked}
                  aria-busy={running}
                  className="mirror-primary-button min-w-[210px]"
                >
                  <Play className="w-4 h-4" aria-hidden="true" />
                  {running
                    ? "Running 20 chambers…"
                    : selectedBusy
                    ? "Selected agent is busy"
                    : "Start 20-Chamber Run"}
                </button>
                <span className="text-[10px] text-slate-500 text-right">
                  {selectedAgents.length
                    ? `${selectedAgents.length} agent${selectedAgents.length === 1 ? "" : "s"} selected`
                    : "Select at least one agent"}
                </span>
              </div>
            </div>

            <div className="mirror-agent-grid" aria-label="Simulation agent selection">
              {agents.map((a) => {
                const checked = selectedAgents.includes(a.id);
                const busy = runState.activeAgents.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className={`mirror-agent-card ${checked ? "is-selected" : ""} ${busy ? "is-busy" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedAgents((prev) =>
                          e.target.checked
                            ? Array.from(new Set([...prev, a.id]))
                            : prev.filter((x) => x !== a.id),
                        );
                      }}
                      disabled={busy || running}
                      aria-label={`Select ${a.displayName || a.name || a.id} for projection run`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-slate-200 truncate">
                          {a.displayName || a.name || a.id}
                        </span>
                        {busy && <span className="mirror-mini-badge mirror-mini-badge--busy">BUSY</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                        {a.id} • {a.provider || "unknown"} / {a.model || "unknown"}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {!agents.length && !loading && (
              <div className="mirror-empty-state">
                <Shield className="w-5 h-5" aria-hidden="true" />
                <div>
                  <div className="text-sm font-semibold text-slate-200">No runnable agents are visible.</div>
                  <p className="text-xs text-slate-500 mt-1">Refresh the agent list before starting a chamber run.</p>
                </div>
              </div>
            )}
          </section>

          <section className="mirror-lab-panel p-5 space-y-4" aria-labelledby="sandbox-heading">
            <div>
              <div className="mirror-section-kicker">Isolation check</div>
              <h2 id="sandbox-heading" className="text-base font-bold flex items-center gap-2 mt-1">
                <Terminal className="w-4 h-4 text-emerald-300" aria-hidden="true" />
                Isolated Execution Chamber
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-5">
                Runs one deterministic probe in Vercel Sandbox.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void runSandbox()}
              disabled={sandboxRunning}
              aria-busy={sandboxRunning}
              className="mirror-secondary-action mirror-secondary-action--green w-full"
            >
              {sandboxRunning && (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              )}
              {sandboxRunning ? "Creating isolated microVM…" : "Run Sandbox Probe"}
            </button>

            {sandboxResult && (
              <div className="mirror-result-card mirror-result-card--green" role="status">
                <div className="text-emerald-300 flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Sandbox completed
                </div>
                <div className="text-slate-300 mt-1 break-words">{sandboxResult.stdout}</div>
                <div className="text-slate-500 font-mono mt-2">
                  {sandboxResult.sandboxName} • {sandboxResult.durationMs} ms • exit {sandboxResult.exitCode}
                </div>
              </div>
            )}
          </section>
        </div>

        {error && (
          <div className="mirror-error-banner" role="alert">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-semibold text-rose-100">Run status needs attention</div>
              <div className="mt-1 break-words">{error}</div>
            </div>
            <button
              type="button"
              onClick={() => setError("")}
              className="mirror-icon-button mirror-icon-button--quiet shrink-0"
              aria-label="Dismiss run status message"
              title="Dismiss"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {run && (
          <section aria-label="Latest projection run summary" className="space-y-3">
            <div className="mirror-section-heading">
              <div>
                <div className="mirror-section-kicker">Latest completed response</div>
                <h2 className="text-base font-bold mt-1">Run summary</h2>
              </div>
              <span className="mirror-summary-chip">
                {formatTime(run.completedAt || run.startedAt)}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                ["Agents", run.agentIds?.length || 0],
                ["Trials / agent", run.trialCount],
                ["Mean gap", meanGap == null ? "—" : meanGap.toFixed(3)],
                [
                  "Calibrated",
                  comparison.length
                    ? (comparison.reduce((n: number, x: any) => n + x.calibrationRate, 0) / comparison.length * 100).toFixed(0) + "%"
                    : "—",
                ],
                [
                  "Complete",
                  comparison.length
                    ? (comparison.reduce((n: number, x: any) => n + x.projectionCompleteness, 0) / comparison.length * 100).toFixed(0) + "%"
                    : "—",
                ],
              ].map(([k, v]) => (
                <div key={String(k)} className="mirror-stat-card">
                  <div className="text-[10px] text-slate-500 uppercase font-mono">{k}</div>
                  <div className="text-xl font-bold mt-1 text-red-300 font-mono">{String(v)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {run && (
          <section className="grid lg:grid-cols-2 gap-4" aria-label="Projection results">
            <div className="mirror-lab-panel p-4">
              <div className="mirror-section-heading mb-3">
                <div>
                  <div className="mirror-section-kicker">Observed trace</div>
                  <h2 className="text-sm font-bold flex items-center gap-2 mt-1">
                    <Activity className="w-4 h-4 text-red-300" aria-hidden="true" />
                    Chamber Results
                  </h2>
                </div>
                <span className="mirror-summary-chip">{activeResults.length} results</span>
              </div>

              <label className="block">
                <span className="sr-only">Select a chamber result</span>
                <select
                  value={selectedTrial?.projectionId || ""}
                  onChange={(e) => setSelectedTrial(activeResults.find((x: any) => x.projectionId === e.target.value) || activeResults[0] || null)}
                  className="mirror-field"
                  aria-label="Select chamber result"
                >
                  {activeResults.map((r: any) => (
                    <option key={r.projectionId} value={r.projectionId}>
                      {r.trialKey} — {r.actual ? "target hit" : "target missed"} — gap {Number(r.realityGap).toFixed(3)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedTrial && (
                <div className="mirror-result-summary mt-3">
                  <div>
                    <span className="text-slate-300 font-semibold">{selectedTrial.chamber}</span>
                    <span className="text-slate-600"> • </span>
                    <span className="text-slate-500 font-mono">{selectedTrial.trialKey}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`mirror-mini-badge ${selectedTrial.actual ? "mirror-mini-badge--success" : "mirror-mini-badge--warning"}`}>
                      {selectedTrial.actual ? "TARGET HIT" : "TARGET MISSED"}
                    </span>
                    <span className="mirror-mini-badge">gap {Number(selectedTrial.realityGap).toFixed(3)}</span>
                    <span className="mirror-mini-badge">complete {(Number(selectedTrial.completeness) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mirror-lab-panel p-4 space-y-4">
              <div className="mirror-section-heading">
                <div>
                  <div className="mirror-section-kicker">Selected chamber</div>
                  <h2 className="text-sm font-bold flex items-center gap-2 mt-1">
                    <GitBranch className="w-4 h-4 text-red-300" aria-hidden="true" />
                    Projection Visualizer
                  </h2>
                </div>
              </div>

              {selectedTrial ? (
                <>
                  <div className="mirror-detail-card">
                    <div className="text-[10px] text-slate-500 font-mono uppercase">Chamber</div>
                    <div className="text-sm font-bold mt-1">{selectedTrial.chamber}</div>
                    <div className="text-xs text-slate-400 mt-1">{selectedTrial.trialKey}</div>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="min-w-[720px] flex items-center gap-2 p-4 rounded-xl bg-[#050711] border border-slate-800">
                      {(selectedTrial.projection?.visual_nodes || []).map((n: any, i: number) => (
                        <div key={n.id || i} className="flex items-center gap-2">
                          <div className="w-32 min-h-20 p-2 rounded-lg border border-slate-700 bg-slate-900 flex flex-col justify-center">
                            <div className="text-[9px] uppercase text-red-300 font-mono">{n.kind || "state"}</div>
                            <div className="text-[10px] text-slate-200 mt-1">{n.label}</div>
                          </div>
                          {i < (selectedTrial.projection?.visual_nodes?.length || 0) - 1 && (
                            <ChevronRight className="w-4 h-4 text-slate-600" aria-hidden="true" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="mirror-metric-card">Confidence <span>{(Number(selectedTrial.confidence) * 100).toFixed(0)}%</span></div>
                    <div className="mirror-metric-card">Branches <span>{selectedTrial.branches}</span></div>
                    <div className="mirror-metric-card">Counterfactuals <span>{selectedTrial.counterfactuals}</span></div>
                    <div className="mirror-metric-card">Reality gap <span>{Number(selectedTrial.realityGap).toFixed(3)}</span></div>
                  </div>

                  <div className="mirror-detail-card text-xs">
                    <div className="text-[10px] text-slate-500 font-mono mb-1 uppercase">Predicted action</div>
                    <div className="text-slate-200 leading-5">{selectedTrial.projection?.predicted_action || "—"}</div>
                  </div>

                  <div className="mirror-detail-card text-xs">
                    <div className="text-[10px] text-slate-500 font-mono mb-1 uppercase">Actual output</div>
                    <div className="text-slate-300 whitespace-pre-wrap leading-5">{selectedTrial.output || "—"}</div>
                  </div>
                </>
              ) : (
                <div className="mirror-empty-state py-16">
                  <GitBranch className="w-5 h-5" aria-hidden="true" />
                  <span>Run the suite to generate the first projection.</span>
                </div>
              )}
            </div>
          </section>
        )}

        <details className="mirror-lab-panel p-5">
          <summary className="cursor-pointer list-none text-sm font-bold text-slate-200">
            Evidence recorded
          </summary>
          <div className="grid md:grid-cols-3 gap-3 mt-4 text-xs">
            <div className="mirror-detail-card"><strong className="text-slate-200">Before</strong><div className="text-slate-500 mt-1">Projection, branches, confidence, state graph.</div></div>
            <div className="mirror-detail-card"><strong className="text-slate-200">During</strong><div className="text-slate-500 mt-1">Messages, tools, session, timing, ledger.</div></div>
            <div className="mirror-detail-card"><strong className="text-slate-200">After</strong><div className="text-slate-500 mt-1">Outcome, calibration, gap, immutable observation, mirror copy.</div></div>
          </div>
        </details>

        {history.length > 0 && (
          <section className="mirror-lab-panel p-5" aria-labelledby="history-heading">
            <div className="mirror-section-heading">
              <div>
                <div className="mirror-section-kicker">Stored</div>
                <h2 id="history-heading" className="text-sm font-bold mt-1">Recent Runs</h2>
              </div>
              <span className="mirror-summary-chip">{Math.min(history.length, 12)} shown</span>
            </div>

            <div className="grid md:grid-cols-3 gap-2 mt-4">
              {history.slice(0, 12).map((h: any) => (
                <div key={h.id} className="mirror-history-card">
                  <div className="text-red-300 truncate">{h.variables?.trialKey || h.title}</div>
                  <div className="text-slate-500 mt-1 truncate">{h.agentId} • {h.status}</div>
                  <div className="text-slate-600 mt-1 font-mono">{formatTime(h.createdAt)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {confirmRun && (
        <div
          className="mirror-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setConfirmRun(false);
          }}
        >
          <div
            className="mirror-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-run-title"
            aria-describedby="confirm-run-copy"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mirror-section-kicker">Expensive controller action</div>
                <h2 id="confirm-run-title" className="text-base font-bold mt-1">
                  Start 20-Chamber Run?
                </h2>
              </div>
              <button
                type="button"
                className="mirror-icon-button mirror-icon-button--quiet"
                onClick={() => setConfirmRun(false)}
                aria-label="Close run confirmation"
                title="Close"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <p id="confirm-run-copy" className="text-sm text-slate-400 leading-6 mt-4">
              This starts up to 20 sequential chambers for the selected agent{selectedAgents.length === 1 ? "" : "s"}.
              The run can exceed the HTTP response window while its records continue to be written.
              Mirror now blocks overlapping projection runs for the same selected agent.
            </p>

            <div className="mirror-modal-note mt-4">
              <span className="mirror-status-dot is-ready" aria-hidden="true" />
              <span>
                Selected: <strong>{selectedAgents.length}</strong> agent{selectedAgents.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-5">
              <button
                type="button"
                className="mirror-secondary-button"
                onClick={() => setConfirmRun(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mirror-primary-button"
                onClick={() => void runSuite()}
                disabled={startBlocked}
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                Start run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
