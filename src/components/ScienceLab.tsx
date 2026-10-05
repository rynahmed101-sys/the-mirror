"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FlaskConical, Play, ShieldCheck, Terminal, RefreshCw } from "lucide-react";

const DEFAULT_CASES = JSON.stringify([
  { id: "zero", input: { x: 0 }, expected: 0 },
  { id: "one", input: { x: 1 }, expected: 1 },
  { id: "two", input: { x: 2 }, expected: 4 },
  { id: "negative", input: { x: -3 }, expected: 9 },
  { id: "fraction", input: { x: 0.125 }, expected: 0.015625 }
], null, 2);

const DEFAULT_SANDBOX = \`// Unverified script: stdout is the only contract.
const x = 3.5;
const predicted = x * x;
console.log(JSON.stringify({ x, predicted }));\`;

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

  async function load() {
    setError("");
    const res = await fetch("/api/science-lab/theories", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load science lab.");
    setCatalog(data);
    if (!theoryId && data.theories?.[0]?.id) setTheoryId(data.theories[0].id);
  }

  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);

  async function runTheory() {
    setRunning(true); setError(""); setResult(null);
    try {
      const parsed = JSON.parse(cases);
      const res = await fetch("/api/science-lab/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theoryId, cases: parsed }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Run failed.");
      setResult(data); await load();
    } catch (e: any) { setError(e.message || String(e)); } finally { setRunning(false); }
  }

  async function runSandbox() {
    setSandboxRunning(true); setError(""); setSandboxResult(null);
    try {
      const res = await fetch("/api/science-lab/sandbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: sandbox }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Sandbox failed.");
      setSandboxResult(data);
    } catch (e: any) { setError(e.message || String(e)); } finally { setSandboxRunning(false); }
  }

  return (
    <main className="min-h-screen bg-[#050507] text-slate-200 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300">Experimental mathematics / physics</div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">MIRROR SCIENCE LAB</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">A controlled evaluation layer for mathematical and physical theories. Calculation stays in the Math/Physics suite; Mirror measures the result, records evidence, and assigns a reproducible stability tier.</p>
          </div>
          <Link href="/" className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold hover:bg-slate-900">Back to Mirror</Link>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-[10px] font-mono uppercase text-slate-500">Trusted theory adapters</div><h2 className="mt-1 flex items-center gap-2 text-base font-bold"><FlaskConical className="h-4 w-4" /> Theory evaluator</h2></div>
              <button onClick={() => void load()} className="rounded-lg border border-slate-700 p-2" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <select value={theoryId} onChange={(e) => setTheoryId(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm">{(catalog?.theories || []).map((t: any) => <option key={t.id} value={t.id}>{t.name} — {t.version}</option>)}</select>
              <button onClick={() => void runTheory()} disabled={running || !theoryId} className="flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-5 py-3 text-xs font-bold disabled:opacity-50"><Play className="h-4 w-4" /> {running ? "Evaluating…" : "Evaluate theory"}</button>
            </div>
            <label className="mt-4 block text-[10px] font-mono uppercase text-slate-500">Reference cases (JSON)</label>
            <textarea value={cases} onChange={(e) => setCases(e.target.value)} spellCheck={false} className="mt-2 h-72 w-full rounded-lg border border-slate-800 bg-black/40 p-3 font-mono text-xs leading-5 outline-none focus:border-cyan-700" />
            {result && <div className="mt-4 rounded-lg border border-slate-800 bg-black/30 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{result.stability?.label}</strong><span className="font-mono text-xs text-slate-500">{result.stability?.tier}</span></div><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">{[["RMSE", result.metrics?.rmse],["Mean abs.", result.metrics?.meanAbsoluteDeviation],["Max abs.", result.metrics?.maxAbsoluteDeviation],["Mean rel.", result.metrics?.meanRelativeError],["Runtime", \`\${Number(result.metrics?.runtimeMs || 0).toFixed(2)} ms\`]].map(([k,v]) => <div key={String(k)} className="rounded-lg border border-slate-800 p-3"><div className="text-[9px] uppercase text-slate-500">{k}</div><div className="mt-1 font-mono text-sm">{typeof v === "number" ? v.toExponential(4) : String(v)}</div></div>)}</div></div>}
          </div>

          <div className="rounded-xl border border-amber-900/40 bg-slate-950/60 p-5">
            <div className="text-[10px] font-mono uppercase text-amber-400">Unverified / pre-validation</div>
            <h2 className="mt-1 flex items-center gap-2 text-base font-bold"><Terminal className="h-4 w-4" /> Sandbox chamber</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> Ephemeral Vercel microVM, network deny-all. Nothing is promoted automatically.</p>
            <textarea value={sandbox} onChange={(e) => setSandbox(e.target.value)} spellCheck={false} className="mt-4 h-72 w-full rounded-lg border border-slate-800 bg-black/40 p-3 font-mono text-xs leading-5 outline-none focus:border-amber-700" />
            <button onClick={() => void runSandbox()} disabled={sandboxRunning} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-800 px-4 py-3 text-xs font-bold disabled:opacity-50">{sandboxRunning ? "Executing in sandbox…" : "Run unverified script"}</button>
            {sandboxResult && <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-800 bg-black/40 p-3 text-[10px] leading-5">{JSON.stringify(sandboxResult, null, 2)}</pre>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="text-[10px] font-mono uppercase text-slate-500">Recorded evidence</div><h2 className="mt-1 text-base font-bold">Recent theory runs</h2>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead><tr className="border-b border-slate-800 text-slate-500"><th className="p-2">Theory</th><th className="p-2">Tier</th><th className="p-2">RMSE</th><th className="p-2">Max abs.</th><th className="p-2">Cases</th><th className="p-2">When</th></tr></thead><tbody>{(catalog?.recentRuns || []).map((run: any) => <tr key={run.id} className="border-b border-slate-900"><td className="p-2">{run.theoryName}</td><td className="p-2">{run.stability?.label || "—"}</td><td className="p-2 font-mono">{run.metrics?.rmse == null ? "—" : Number(run.metrics.rmse).toExponential(3)}</td><td className="p-2 font-mono">{run.metrics?.maxAbsoluteDeviation == null ? "—" : Number(run.metrics.maxAbsoluteDeviation).toExponential(3)}</td><td className="p-2">{run.metrics?.sampleCount ?? "—"}</td><td className="p-2 text-slate-500">{run.createdAt ? new Date(run.createdAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div>
        </section>
        {error && <div className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</div>}
      </div>
    </main>
  );
}
