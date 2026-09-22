"use client";

import { useState } from "react";
import { Play, Terminal, ShieldCheck, Activity } from "lucide-react";

type Props = {
  agentId: string;
  model?: string | null;
  onComplete?: () => Promise<void> | void;
};

export default function AgentTerminal({ agentId, model, onComplete }: Props) {
  const [objective, setObjective] = useState(
    "Inspect the current Mirror state and choose one bounded evidence-preserving next action."
  );
  const [cycles, setCycles] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    try {
      setBusy(true);
      setResult(null);

      const response = await fetch("/api/mirror/bot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId,
          objective,
          maxCycles: Math.min(4, Math.max(1, cycles)),
          maxToolSteps: 6,
        }),
      });

      const data = await response.json();
      setResult(data);

      if (response.ok) {
        await onComplete?.();
      }
    } catch (error: any) {
      setResult({ success: false, error: error?.message || String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="glass-panel p-5 rounded-xl border border-cyan-900/70 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-cyan-300 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-cyan-400" />
            Mirror Autopilot Control
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real Ollama Cloud execution with bounded cycles, native tools, persistent sessions, and ledger traces.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-mono">
              Admin session
            </div>
            <div className="mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-emerald-300 font-mono text-xs">
              Authenticated browser session is used automatically. No API key required.
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-500 font-mono">
              Cycles (1-4)
            </label>
            <input
              type="number"
              min={1}
              max={4}
              value={cycles}
              onChange={(e) => setCycles(Math.min(4, Math.max(1, Number(e.target.value) || 1)))}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono text-xs"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide text-slate-500 font-mono">
            Objective
          </label>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={4}
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 text-xs leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] font-mono text-slate-500">
            <span className="inline-flex items-center gap-1 mr-3">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              {agentId}
            </span>
            <span className="inline-flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              {model || "gpt-oss:20b-cloud"}
            </span>
          </div>

          <button
            onClick={run}
            disabled={busy}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-xs"
          >
            <Play className="w-3.5 h-3.5" />
            {busy ? "Running..." : "Run Autopilot"}
          </button>
        </div>
      </div>

      {result && (
        <div className="glass-panel p-5 rounded-xl border border-slate-800 font-mono text-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-200">Execution Result</h3>
            <span className={result.success ? "text-emerald-400" : "text-rose-400"}>
              {result.success ? "SUCCESS" : "FAILED"}
            </span>
          </div>

          {result.success ? (
            <>
              <div className="text-slate-400">
                Completed {result.cyclesCompleted} / {result.cyclesRequested} cycles.
              </div>
              <div className="space-y-2">
                {(result.results || []).map((run: any) => (
                  <div
                    key={run.sessionId || run.cycle}
                    className="p-3 bg-slate-950 rounded-lg border border-slate-800"
                  >
                    <div className="text-cyan-300">
                      Cycle {run.cycle} · {run.phase}
                    </div>
                    <div className="text-slate-500 mt-1">
                      Session: {run.sessionId || "—"}
                    </div>
                    <div className="text-slate-500">
                      Model: {run.activeModel || "—"} · Steps: {run.steps ?? "—"} · Tools: {run.trace?.length ?? 0}
                    </div>
                    <div className="text-slate-300 mt-2 whitespace-pre-wrap">
                      {run.output || "No final text returned."}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-rose-300">{result.error || "Autopilot failed."}</div>
          )}
        </div>
      )}
    </div>
  );
}
