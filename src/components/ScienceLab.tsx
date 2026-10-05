"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Play, RefreshCw, ShieldCheck, Terminal, LogOut, Activity } from "lucide-react";

const DEFAULT_CASES = JSON.stringify([
  { id: "zero", input: { x: 0 }, expected: 0 },
  { id: "one", input: { x: 1 }, expected: 1 },
  { id: "two", input: { x: 2 }, expected: 4 },
  { id: "negative", input: { x: -3 }, expected: 9 },
  { id: "fraction", input: { x: 0.125 }, expected: 0.015625 }
], null, 2);

const DEFAULT_SANDBOX = `// Pre-validation only. Network access is disabled.
const samples = [0, 1, 2, -3, 0.125];
const results = samples.map((x) => ({ x, predicted: x * x }));
console.log(JSON.stringify({ status: "sandbox-ok", results }));`;

function Metric({ label, value, scientific = true }: { label: string; value: unknown; scientific?: boolean }) {
  const display = typeof value === "number" ? (scientific ? value.toExponential(4) : `${value.toFixed(2)} ms`) : "—";
  return <div className="rounded-lg border border-slate-800 bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wider text-slate-600">{label}</div><div className="mt-1 font-mono text-sm text-slate-200">{display}</div></div>;
}

export default function ScienceLab() {
  const [catalog, setCatalog] = useState<any>(null);
  const [theoryId, setTheoryId] = useState("");
  const [cases, setCases] = useState(DEFAULT_CASES);
  const [sandbox, setSandbox] = useState(DEFAULT_SANDBOX);
  const [result, setResult] = useState<any>(null);
  const [sandboxResult, setSandboxResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [sandboxRunning, setSandboxRunning] = useState(false);

  const selectedTheory = useMemo(() => catalog?.theories?.find((t: any) => t.id === theoryId), [catalog, theoryId]);

  async function load() {
    setError("");
    const res = await fetch("/api/science-lab/theories", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load the laboratory.");
    setCatalog(data);
    if (!theoryId && data.theories?.[0]?.id) setTheoryId(data.theories[0].id);
  }

  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);

  async function runTheory() {
    setRunning(true); setError(""); setResult(null);
    try {
      const parsed = JSON.parse(cases);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Reference cases must be a non-empty JSON array.");
      const res = await fetch("/api/science-lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theoryId, cases: parsed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Theory evaluation failed.");
      setResult(data);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  async function runSandbox() {
    setSandboxRunning(true); setError(""); setSandboxResult(null);
    try {
      const res = await fetch("/api/science-lab/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sandbox })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Sandbox execution failed.");
      setSandboxResult(data);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSandboxRunning(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin";
  }

  return (
    <main className="min-h-screen bg-[#050608] px-4 py-7 text-slate-200 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-5 border-b border-slate-900 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-300"><FlaskConical className="h-3.5 w-3.5" /> Experimental mathematics / physics</div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">THE MIRROR</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">A live workbench for challenging formulas, models, and theories. Mirror measures implementations against reference evidence; it does not decide whether a hypothesis is true.</p>
          </div>
          <button onClick={() => void logout()} className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400 hover:bg-slate-900 hover:text-slate-200"><LogOut className="h-3.5 w-3.5" /> Exit</button>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-[10px] font-mono uppercase text-slate-600">Trusted theory adapters</div><h2 className="mt-1 flex items-center gap-2 font-semibold"><Activity className="h-4 w-4 text-cyan-300" /> Evaluation bench</h2></div>
              <button onClick={() => void load()} className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-800 px-3 py-2 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <select value={theoryId} onChange={(e) => setTheoryId(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-cyan-700">
                {(catalog?.theories || []).map((t: any) => <option key={t.id} value={t.id}>{t.name} · {t.version}</option>)}
              </select>
              <button onClick={() => void runTheory()} disabled={running || !theoryId} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-5 py-3 text-xs font-bold disabled:opacity-50"><Play className="h-4 w-4" />{running ? "Evaluating…" : "Evaluate theory"}</button>
            </div>

            {selectedTheory && <div className="mt-3 rounded-lg border border-slate-900 bg-black/20 p-3 text-xs text-slate-500"><span className="font-mono text-slate-400">{selectedTheory.id}</span> · {selectedTheory.domain} · {selectedTheory.source}<div className="mt-1">{selectedTheory.description}</div></div>}

            <label className="mt-5 block text-[10px] font-mono uppercase tracking-wider text-slate-600">Reference cases · JSON</label>
            <textarea value={cases} onChange={(e) => setCases(e.target.value)} spellCheck={false} className="mt-2 h-72 w-full rounded-lg border border-slate-800 bg-black/40 p-3 font-mono text-xs leading-5 outline-none focus:border-cyan-700" />

            {result && <div className="mt-4 rounded-xl border border-cyan-900/40 bg-cyan-950/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><div className="text-[10px] font-mono uppercase text-slate-600">Classification</div><strong className="text-lg">{result.stability?.label}</strong></div>
                <span className="rounded-full border border-slate-800 px-3 py-1 font-mono text-[10px] text-slate-400">{result.stability?.tier}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{result.stability?.reason}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
                <Metric label="RMSE" value={result.metrics?.rmse} />
                <Metric label="Mean abs." value={result.metrics?.meanAbsoluteDeviation} />
                <Metric label="Max abs." value={result.metrics?.maxAbsoluteDeviation} />
                <Metric label="Mean relative" value={result.metrics?.meanRelativeError} />
                <Metric label="Runtime" value={result.metrics?.runtimeMs} scientific={false} />
              </div>
              <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-[11px]"><thead><tr className="border-b border-slate-800 text-slate-600"><th className="p-2">Case</th><th className="p-2">Expected</th><th className="p-2">Predicted</th><th className="p-2">Max error</th><th className="p-2">Status</th></tr></thead><tbody>{(result.cases || []).map((c: any) => <tr key={c.id} className="border-b border-slate-900"><td className="p-2 font-mono">{c.id}</td><td className="p-2">{JSON.stringify(c.expected)}</td><td className="p-2">{JSON.stringify(c.predicted ?? "—")}</td><td className="p-2 font-mono">{c.metrics?.maxComponentDeviation == null ? "—" : Number(c.metrics.maxComponentDeviation).toExponential(3)}</td><td className="p-2">{c.ok ? "PASS" : <span className="text-rose-300">{c.error}</span>}</td></tr>)}</tbody></table></div>
            </div>}
          </div>

          <div className="rounded-xl border border-amber-900/40 bg-slate-950/60 p-5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400">Unverified / pre-validation</div>
            <h2 className="mt-1 flex items-center gap-2 font-semibold"><Terminal className="h-4 w-4" /> Sandbox chamber</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> Ephemeral Vercel microVM · network deny-all · 30 second execution ceiling · never auto-promoted.</p>
            <textarea value={sandbox} onChange={(e) => setSandbox(e.target.value)} spellCheck={false} className="mt-4 h-72 w-full rounded-lg border border-slate-800 bg-black/40 p-3 font-mono text-xs leading-5 outline-none focus:border-amber-700" />
            <button onClick={() => void runSandbox()} disabled={sandboxRunning} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-800 px-4 py-3 text-xs font-bold disabled:opacity-50">{sandboxRunning ? "Executing…" : "Run unverified script"}</button>
            {sandboxResult && <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-800 bg-black/40 p-3 text-[10px] leading-5 text-slate-400">{JSON.stringify(sandboxResult, null, 2)}</pre>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex items-end justify-between gap-3"><div><div className="text-[10px] font-mono uppercase text-slate-600">Evidence ledger</div><h2 className="mt-1 font-semibold">Recent theory runs</h2></div><span className="text-[10px] font-mono text-slate-600">{catalog?.recentRuns?.length ?? 0} loaded</span></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-slate-800 text-slate-600"><th className="p-2">Theory</th><th className="p-2">Tier</th><th className="p-2">RMSE</th><th className="p-2">Max abs.</th><th className="p-2">Cases</th><th className="p-2">When</th></tr></thead><tbody>{(catalog?.recentRuns || []).map((run: any) => <tr key={run.id} className="border-b border-slate-900"><td className="p-2">{run.theoryName}</td><td className="p-2">{run.stability?.label || "—"}</td><td className="p-2 font-mono">{run.metrics?.rmse == null ? "—" : Number(run.metrics.rmse).toExponential(3)}</td><td className="p-2 font-mono">{run.metrics?.maxAbsoluteDeviation == null ? "—" : Number(run.metrics.maxAbsoluteDeviation).toExponential(3)}</td><td className="p-2">{run.metrics?.sampleCount ?? "—"}</td><td className="p-2 text-slate-600">{run.createdAt ? new Date(run.createdAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div>
        </section>

        {error && <div role="alert" className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</div>}
      </div>
    </main>
  );
}
