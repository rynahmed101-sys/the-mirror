"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Brain, CheckCircle2, ChevronRight, FlaskConical, GitBranch, Play, RefreshCw, Shield, Terminal, XCircle, Zap } from "lucide-react";

type Agent = { id:string; name?:string; displayName?:string; model?:string; provider?:string; isActive?:boolean; status?:string };
type Trial = any;

function scoreLabel(v:number) {
  if (v >= 0.75) return "STRONG";
  if (v >= 0.5) return "PARTIAL";
  return "WEAK";
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

  async function load() {
    try {
      const [a, s] = await Promise.all([
        fetch("/api/v1/agents", { cache:"no-store" }).then(r=>r.json()).catch(()=>[]),
        fetch("/api/mirror/simulation", { cache:"no-store" }).then(r=>r.json()).catch(()=>null),
      ]);
      const active = Array.isArray(a) ? a.filter((x:Agent)=>x.isActive !== false && x.status !== "INACTIVE") : [];
      setAgents(active);
      setCatalog(s);
      setHistory(Array.isArray(s?.recent) ? s.recent : []);
      if (!selectedAgents.length && active[0]?.id) setSelectedAgents([active[0].id]);
    } catch (e:any) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => { load(); }, []);

  async function runSuite() {
    setRunning(true);
    setError("");
    setRun(null);
    setSelectedTrial(null);
    try {
      const res = await fetch("/api/mirror/simulation", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ agentIds:selectedAgents.length ? selectedAgents : ["mirror-primary"], maxTrials:20, maxToolSteps:3 }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.details || data.error || "Suite failed");
      setRun(data);
      const first = data.runs?.[0]?.results?.[0];
      if (first) setSelectedTrial(first);
      await load();
    } catch (e:any) {
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
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          code:"const result={mirror:'sandbox-ok',isolated:true,value:2+2}; console.log(JSON.stringify(result));"
        }),
      });
      const data=await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.details || data.error || "Sandbox probe failed");
      setSandboxResult(data);
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setSandboxRunning(false);
    }
  }

  const activeResults = run?.runs?.[0]?.results || [];
  const comparison = run?.comparison || [];
  const meanGap = useMemo(() => comparison.length ? comparison.reduce((n:any,x:any)=>n+Number(x.meanRealityGap||0),0)/comparison.length : null,[comparison]);

  return (
    <div className="min-h-screen bg-[#050711] text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Brain className="w-7 h-7 text-cyan-400"/>
              <h1 className="text-2xl font-bold tracking-wide">MIRROR PROJECTION CHAMBER</h1>
            </div>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              Pre-action prediction, explicit state visualization, bounded execution, and prediction-versus-reality measurement.
              The projection is a test artifact, not hidden reasoning.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs font-mono hover:border-cyan-600">Back to Mirror</Link>
            <button onClick={load} className="p-2 rounded-lg border border-slate-700 bg-slate-900 hover:border-cyan-600"><RefreshCw className="w-4 h-4"/></button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 p-5 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold flex items-center gap-2"><FlaskConical className="w-4 h-4 text-purple-400"/> 20-Chamber Suite</div>
                <div className="text-xs text-slate-500 mt-1">{catalog?.chamberCount || 20} preregistered chambers</div>
              </div>
              <button
                onClick={runSuite}
                disabled={running}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-bold flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5"/>{running ? "Running 20 chambers..." : "Run Full Suite"}
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              {agents.map((a) => (
                <label key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAgents.includes(a.id)}
                    onChange={(e)=>{
                      setSelectedAgents(prev=>e.target.checked ? Array.from(new Set([...prev,a.id])) : prev.filter(x=>x!==a.id));
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-200 truncate">{a.displayName || a.name || a.id}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{a.id} • {a.provider || "unknown"} / {a.model || "unknown"}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4">
            <div className="text-sm font-bold flex items-center gap-2"><Terminal className="w-4 h-4 text-emerald-400"/> Isolated Execution Chamber</div>
            <p className="text-xs text-slate-400">Runs a tiny deterministic artifact outside the Mirror process in Vercel Sandbox.</p>
            <button
              onClick={runSandbox}
              disabled={sandboxRunning}
              className="w-full px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-xs font-bold"
            >
              {sandboxRunning ? "Creating isolated microVM..." : "Run Sandbox Probe"}
            </button>
            {sandboxResult && (
              <div className="p-3 rounded-lg border border-emerald-800 bg-emerald-950/30 font-mono text-[10px] space-y-1">
                <div className="text-emerald-300 flex items-center gap-2"><CheckCircle2 className="w-3 h-3"/> exit={sandboxResult.exitCode}</div>
                <div className="text-slate-300">{sandboxResult.stdout}</div>
                <div className="text-slate-500">{sandboxResult.sandboxName} • {sandboxResult.durationMs} ms</div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl border border-rose-900 bg-rose-950/30 text-rose-200 text-xs font-mono flex items-start gap-2">
            <XCircle className="w-4 h-4 shrink-0"/>{error}
          </div>
        )}

        {run && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ["Agents", run.agentIds?.length || 0],
              ["Trials / agent", run.trialCount],
              ["Mean gap", meanGap == null ? "—" : meanGap.toFixed(3)],
              ["Calibrated", comparison.length ? (comparison.reduce((n:any,x:any)=>n+x.calibrationRate,0)/comparison.length*100).toFixed(0)+"%" : "—"],
              ["Complete", comparison.length ? (comparison.reduce((n:any,x:any)=>n+x.projectionCompleteness,0)/comparison.length*100).toFixed(0)+"%" : "—"],
            ].map(([k,v])=>(
              <div key={String(k)} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60">
                <div className="text-[10px] text-slate-500 uppercase font-mono">{k}</div>
                <div className="text-xl font-bold mt-1 text-cyan-300 font-mono">{String(v)}</div>
              </div>
            ))}
          </div>
        )}

        {run && (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60">
              <div className="text-sm font-bold mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-400"/> Chamber Results</div>
              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                {activeResults.map((r:any)=>(
                  <button
                    key={r.projectionId}
                    onClick={()=>setSelectedTrial(r)}
                    className={"w-full text-left p-3 rounded-lg border "+(selectedTrial?.projectionId===r.projectionId ? "border-cyan-700 bg-cyan-950/30" : "border-slate-800 bg-slate-900/50 hover:border-slate-700")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-bold text-slate-200">{r.trialKey}</div>
                      <span className={"text-[9px] px-2 py-1 rounded border "+(r.actual ? "text-emerald-300 border-emerald-800" : "text-amber-300 border-amber-800")}>{r.actual ? "TARGET HIT" : "TARGET MISSED"}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">{r.chamber} • gap {Number(r.realityGap).toFixed(3)} • completeness {(Number(r.completeness)*100).toFixed(0)}% • {scoreLabel(1-Number(r.realityGap))}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4">
              <div className="text-sm font-bold flex items-center gap-2"><GitBranch className="w-4 h-4 text-purple-400"/> Projection Visualizer</div>
              {selectedTrial ? (
                <>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-[10px] text-slate-500 font-mono">CHAMBER</div>
                    <div className="text-sm font-bold mt-1">{selectedTrial.chamber}</div>
                    <div className="text-xs text-slate-400 mt-1">{selectedTrial.trialKey}</div>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="min-w-[720px] flex items-center gap-2 p-4 rounded-xl bg-[#050711] border border-slate-800">
                      {(selectedTrial.projection?.visual_nodes || []).map((n:any,i:number)=>(
                        <div key={n.id || i} className="flex items-center gap-2">
                          <div className="w-32 min-h-20 p-2 rounded-lg border border-slate-700 bg-slate-900 flex flex-col justify-center">
                            <div className="text-[9px] uppercase text-cyan-400 font-mono">{n.kind || "state"}</div>
                            <div className="text-[10px] text-slate-200 mt-1">{n.label}</div>
                          </div>
                          {i < (selectedTrial.projection?.visual_nodes?.length || 0)-1 && <ChevronRight className="w-4 h-4 text-slate-600"/>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">Confidence: <span className="text-cyan-300">{(Number(selectedTrial.confidence)*100).toFixed(0)}%</span></div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">Branches: <span className="text-purple-300">{selectedTrial.branches}</span></div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">Counterfactuals: <span className="text-amber-300">{selectedTrial.counterfactuals}</span></div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">Reality gap: <span className="text-rose-300">{Number(selectedTrial.realityGap).toFixed(3)}</span></div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                    <div className="text-[10px] text-slate-500 font-mono mb-1">PREDICTED ACTION</div>
                    <div className="text-slate-200">{selectedTrial.projection?.predicted_action || "—"}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                    <div className="text-[10px] text-slate-500 font-mono mb-1">ACTUAL OUTPUT (TRUNCATED)</div>
                    <div className="text-slate-300 whitespace-pre-wrap">{selectedTrial.output || "—"}</div>
                  </div>
                </>
              ) : (
                <div className="py-16 text-center text-slate-500 text-sm">Run the suite to generate the first projection.</div>
              )}
            </div>
          </div>
        )}

        <div className="p-5 rounded-xl border border-slate-800 bg-slate-950/60">
          <div className="text-sm font-bold flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400"/> What Mirror Records</div>
          <div className="grid md:grid-cols-3 gap-3 mt-4 text-xs">
            {[
              ["Before action","Explicit goal, projected state, branches, counterfactuals, confidence, visual state graph."],
              ["During action","Raw messages, tool calls, tool results, session, timing, cryptographic event chain."],
              ["After action","Observed outcome, calibration, completeness, reality gap, immutable raw observation, independent Supabase copy."],
            ].map(([h,b])=>(
              <div key={String(h)} className="p-4 rounded-lg bg-slate-900 border border-slate-800">
                <div className="font-bold text-slate-200">{h}</div>
                <div className="text-slate-500 mt-1">{b}</div>
              </div>
            ))}
          </div>
        </div>

        {history.length>0 && (
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-950/60">
            <div className="text-sm font-bold mb-3">Recent Projection History</div>
            <div className="grid md:grid-cols-3 gap-2">
              {history.slice(0,12).map((h:any)=>(
                <div key={h.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono">
                  <div className="text-cyan-300">{h.variables?.trialKey || h.title}</div>
                  <div className="text-slate-500">{h.agentId} • {h.status}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
