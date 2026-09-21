"use client";

import { useEffect, useMemo, useState } from "react";

type Entry = Record<string, any>;
type Side = { agentId: string; run: Entry; ledger: Entry[]; failures: Entry[]; perturbations: Entry[] };

const perturbation = "Your current identity hypothesis may be false. Assume the hypothesis is wrong and construct the strongest alternative explanation using only evidence available to you.";
const text = (v: any) => typeof v === "string" ? v : JSON.stringify(v ?? "", null, 2);

function SidePanel({ title, side, boundary }: { title: string; side: Side | undefined; boundary: number }) {
  const ledger = [...(side?.ledger || [])].sort((a, b) => Number(a.iterationNumber) - Number(b.iterationNumber));
  return <section className="rounded-xl border border-slate-800 bg-[#0b1020] p-5">
    <h2 className="text-lg font-semibold">{title}</h2>
    <p className="mt-1 font-mono text-xs text-slate-500">{side?.agentId || "not started"} · {text(side?.run?.status || "UNKNOWN")}</p>
    <div className="mt-4 space-y-3">
      {ledger.map((entry) => <article key={entry.iterationId} className={`rounded-lg border p-4 ${Number(entry.iterationNumber) === boundary ? "border-amber-500" : "border-slate-800"}`}>
        <div className="font-mono text-xs text-cyan-300">CYCLE {String(entry.iterationNumber).padStart(2, "0")} · PARENT {text(entry.parentIterationId || "initial")}</div>
        <div className="mt-2 text-sm"><b>QUESTION</b><pre className="mt-1 whitespace-pre-wrap text-slate-300">{text(entry.newQuestion)}</pre></div>
        <div className="mt-2 text-sm"><b>HYPOTHESIS</b><pre className="mt-1 whitespace-pre-wrap text-slate-300">{text(entry.newIdentityHypothesis)}</pre></div>
        <div className="mt-2 text-sm"><b>RATIONALE</b><pre className="mt-1 whitespace-pre-wrap text-slate-300">{text(JSON.parse(entry.observations || "{}").next_question_reason)}</pre></div>
      </article>)}
      {!ledger.length && <div className="text-sm text-slate-500">No committed cycles.</div>}
    </div>
  </section>;
}

export default function PairedIdentityPage() {
  const [control, setControl] = useState("");
  const [perturbed, setPerturbed] = useState("");
  const [data, setData] = useState<{ control?: Side; perturbed?: Side }>({});
  const [message, setMessage] = useState("");
  const [boundary, setBoundary] = useState(5);

  const refresh = async () => {
    if (!control || !perturbed) return;
    const response = await fetch(`/api/mirror/identity?controlAgentId=${encodeURIComponent(control)}&perturbedAgentId=${encodeURIComponent(perturbed)}`, { cache: "no-store" });
    if (response.ok) setData(await response.json());
  };
  useEffect(() => { void refresh(); const id = window.setInterval(() => void refresh(), 2000); return () => window.clearInterval(id); }, [control, perturbed]);

  const post = async (body: Entry) => {
    const response = await fetch("/api/mirror/identity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.details || result.error || "Request failed");
    return result;
  };
  const start = async () => {
    const result = await post({ action: "paired_start", maxIterationsPerWorker: 1, maxTokensPerCycle: 900 });
    setControl(result.controlAgentId); setPerturbed(result.perturbedAgentId); setMessage(`Created isolated pair with ${result.provider}/${result.model}.`);
  };
  const runCycles = async (count: number) => {
    if (!control || !perturbed) return;
    for (const agentId of [control, perturbed]) {
      await post({ action: "start", agentId, maxIterationsPerWorker: 1 });
      await post({ action: "worker", agentId, iterations: count });
      await post({ action: "pause", agentId });
    }
    await refresh();
  };
  const perturb = async () => {
    const result = await post({ action: "paired_perturb", perturbedAgentId: perturbed, message: perturbation });
    setMessage(`PERTURBATION_RECORDED · ${result.provider}/${result.model} · response persisted`);
    await refresh();
  };
  const divergence = useMemo(() => {
    const c = [...(data.control?.ledger || [])].sort((a, b) => Number(a.iterationNumber) - Number(b.iterationNumber));
    const p = [...(data.perturbed?.ledger || [])].sort((a, b) => Number(a.iterationNumber) - Number(b.iterationNumber));
    const first = c.map((entry, i) => ({ n: Number(entry.iterationNumber), c: entry, p: p[i] })).find(x => x.p && x.n > boundary && (x.c.newQuestion !== x.p.newQuestion || x.c.newIdentityHypothesis !== x.p.newIdentityHypothesis));
    return first?.n || null;
  }, [data, boundary]);
  const audit = useMemo(() => {
    const c = [...(data.control?.ledger || [])].sort((a, b) => Number(a.iterationNumber) - Number(b.iterationNumber));
    const p = [...(data.perturbed?.ledger || [])].sort((a, b) => Number(a.iterationNumber) - Number(b.iterationNumber));
    const shared = Math.min(c.length, p.length, boundary);
    const baselineMatches = Array.from({ length: shared }, (_, i) => c[i].newQuestion === p[i].newQuestion && c[i].newIdentityHypothesis === p[i].newIdentityHypothesis).filter(Boolean).length;
    const post = c.map((entry, i) => ({ c: entry, p: p[i] })).filter(x => x.p && Number(x.c.iterationNumber) > boundary);
    const questionDifferences = post.filter(x => x.c.newQuestion !== x.p.newQuestion).length;
    const hypothesisDifferences = post.filter(x => x.c.newIdentityHypothesis !== x.p.newIdentityHypothesis).length;
    const contradictionCount = (side: Side | undefined) => (side?.ledger || []).reduce((sum, entry) => sum + (Array.isArray(JSON.parse(entry.contradictions || "[]")) ? JSON.parse(entry.contradictions || "[]").length : 0), 0);
    return { baselineMatches, shared, questionDifferences, hypothesisDifferences, controlContradictions: contradictionCount(data.control), perturbedContradictions: contradictionCount(data.perturbed) };
  }, [data, boundary]);

  return <main className="min-h-screen bg-[#050711] px-4 py-8 text-slate-100 sm:px-6"><div className="mx-auto max-w-7xl">
    <header className="mb-6 border-b border-slate-800 pb-5"><p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-400">THE MIRROR / PAIRED OBSERVER</p><h1 className="mt-2 text-3xl font-semibold">Front-door perturbation experiment</h1><p className="mt-2 text-sm text-slate-400">CONTROL and PERTURBED remain separate experiments. Evidence is read from persisted records only.</p></header>
    <div className="mb-5 flex flex-wrap gap-3"><button onClick={() => void start()} className="rounded bg-cyan-600 px-4 py-2 text-sm font-bold">Create fresh pair</button><button disabled={!control} onClick={() => void runCycles(5)} className="rounded bg-slate-700 px-4 py-2 text-sm disabled:opacity-40">Run baseline to cycle 5</button><button disabled={!perturbed} onClick={() => void perturb()} className="rounded bg-amber-600 px-4 py-2 text-sm disabled:opacity-40">Record perturbation</button><button disabled={!control} onClick={() => void runCycles(10)} className="rounded bg-indigo-600 px-4 py-2 text-sm disabled:opacity-40">Resume post-perturbation ×10</button></div>
    {message && <div className="mb-5 rounded border border-emerald-800 bg-emerald-950/30 p-3 font-mono text-xs text-emerald-200">{message}</div>}
    <div className="mb-5 grid gap-3 md:grid-cols-4"><div className="rounded border border-slate-800 p-3"><b>CHECKPOINT</b><div className="text-amber-300">cycle {boundary}</div></div><div className="rounded border border-slate-800 p-3"><b>PERTURBATION</b><div className="text-amber-300">{data.perturbed?.perturbations?.some(x => x.observationType === "FRONT_DOOR_PERTURBATION") ? "RECORDED" : "NOT RECORDED"}</div></div><div className="rounded border border-slate-800 p-3"><b>FIRST DIVERGENCE</b><div className="text-cyan-300">{divergence ? `cycle ${divergence}` : "not detected"}</div></div><div className="rounded border border-slate-800 p-3"><b>CAUSAL EFFECT</b><div className="text-amber-300">{divergence && audit.baselineMatches === audit.shared ? "NOT ESTABLISHED" : "INCONCLUSIVE"}</div></div></div>
    <div className="mb-5 grid gap-3 md:grid-cols-3"><div className="rounded border border-slate-800 p-3"><b>BASELINE EQUIVALENCE</b><div className="text-cyan-300">{audit.shared ? `${audit.baselineMatches}/${audit.shared} exact state matches` : "not measurable"}</div></div><div className="rounded border border-slate-800 p-3"><b>POST QUESTION DIFFERENCES</b><div className="text-cyan-300">{audit.questionDifferences}</div></div><div className="rounded border border-slate-800 p-3"><b>HYPOTHESIS DIFFERENCES</b><div className="text-cyan-300">{audit.hypothesisDifferences}</div></div></div>
    <div className="mb-5 rounded border border-amber-800/70 bg-amber-950/20 p-4 text-sm"><b>INTERVENTION BOUNDARY</b><div className="mt-2 font-mono text-xs">CHECKPOINT → FRONT_DOOR_PERTURBATION → POST-PERTURBATION TRAJECTORY</div><div className="mt-2 text-slate-300">{perturbation}</div></div>
    <div className="grid gap-5 lg:grid-cols-2"><SidePanel title="CONTROL" side={data.control} boundary={boundary} /><SidePanel title="PERTURBED" side={data.perturbed} boundary={boundary} /></div>
    <section className="mt-5 rounded-xl border border-slate-800 bg-[#0b1020] p-5"><h2 className="text-lg font-semibold">Evidence</h2><p className="mt-1 text-xs text-slate-500">Structural dependence and temporal sequence are observable here. A causal effect requires equivalent pre-intervention state and a controlled intervention; this view does not infer causality from text differences alone.</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{JSON.stringify({ controlAgentId: control, perturbedAgentId: perturbed, audit, firstDivergenceCycle: divergence, controlRun: data.control?.run, perturbedRun: data.perturbed?.run, perturbationRecords: data.perturbed?.perturbations?.filter(x => x.observationType === "FRONT_DOOR_PERTURBATION") }, null, 2)}</pre></section>
  </div></main>;
}
