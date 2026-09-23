"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, Circle, Moon, Radio, RefreshCw, Zap } from "lucide-react";

type LifeState="SINGULARITY"|"WATCHING"|"THINKING"|"INTEGRATING"|"DORMANT"|"ERROR";
type MirrorPayload={state:{
  agentId:string; state:LifeState; pulseCount:number; cycleCount:number; lastWakeAt:string|null;
  lastThought:string|null; lastAction:string|null; lastError:string|null; activeNodes:string[]; updatedAt:string;
};brain:{active:number;trained:number;total:number;activeNodes:string[]}};

const labels:Record<LifeState,string>={
  SINGULARITY:"THE MIRROR IS QUIET", WATCHING:"WATCHING", THINKING:"THINKING",
  INTEGRATING:"INTEGRATING", DORMANT:"DORMANT", ERROR:"INTERRUPTED"
};

export default function MirrorWorkspace(){
  const [data,setData]=useState<MirrorPayload|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const read=useCallback(async()=>{
    try{
      const res=await fetch("/api/mirror/black-hole",{cache:"no-store"});
      const body=await res.json();
      if(!res.ok) throw new Error(body.error||"Mirror state unavailable");
      setData(body); setError("");
    }catch(e:any){setError(e?.message||String(e));}
  },[]);

  const pulse=useCallback(async()=>{
    try{
      await fetch("/api/mirror/black-hole",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"pulse"})});
    }catch{}
  },[]);

  useEffect(()=>{
    void read();
    const poll=window.setInterval(()=>{void read();},5000);
    const heartbeat=window.setInterval(()=>{void pulse();},15000);
    return ()=>{window.clearInterval(poll);window.clearInterval(heartbeat);};
  },[read,pulse]);

  async function wake(){
    if(busy)return;
    setBusy(true);setError("");
    try{
      const res=await fetch("/api/mirror/black-hole",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"wake"})});
      const body=await res.json();
      if(!res.ok) throw new Error(body.error||body.state?.lastError||"Wake failed");
      setData({state:body.state,brain:data?.brain||{active:0,trained:0,total:96,activeNodes:[]}});
      await read();
    }catch(e:any){setError(e?.message||String(e));await read();}
    finally{setBusy(false);}
  }

  const state=data?.state;
  const brain=data?.brain;
  const age=state?.updatedAt ? Math.max(0,Math.floor((Date.now()-new Date(state.updatedAt).getTime())/1000)) : null;
  const rings=useMemo(()=>Array.from({length:6},(_,i)=>i),[]);

  return <main className="min-h-dvh overflow-hidden bg-[#020202] text-zinc-100">
    <div className="relative min-h-dvh">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(127,29,29,0.16),transparent_34%),radial-gradient(circle_at_center,rgba(0,0,0,0.96),transparent_58%)]"/>
      <div className="absolute left-5 top-5 z-20">
        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-600">THE MIRROR</div>
        <div className="mt-1 text-xs text-zinc-700">persistent self-observation state</div>
      </div>
      <div className="absolute right-5 top-5 z-20 flex items-center gap-2 text-[10px] font-mono text-zinc-600">
        <Radio className="h-3.5 w-3.5 text-red-500/70"/>
        {labels[state?.state||"DORMANT"]}
      </div>

      <section className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-5 py-20">
        <div className="relative grid h-[min(70vw,430px)] w-[min(70vw,430px)] place-items-center">
          {rings.map(i=><div key={i} className="absolute rounded-full border border-red-500/[0.06]" style={{inset:(i*7)+"%"}}/>)}
          <div className={"absolute h-[46%] w-[46%] rounded-full border border-red-500/20 "+(state?.state==="THINKING"?"animate-pulse":"")} />
          <div className="relative grid h-[34%] w-[34%] place-items-center rounded-full border border-red-500/15 bg-black shadow-[0_0_120px_rgba(80,0,0,0.7)]">
            <div className={"h-[13%] w-[13%] rounded-full bg-zinc-100 shadow-[0_0_45px_rgba(255,255,255,0.4)] "+(state?.state==="WATCHING"?"animate-ping":"")}/>
          </div>
        </div>

        <div className="mt-2 text-center">
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-red-300/70">{labels[state?.state||"DORMANT"]}</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-4xl">Nothing waits here. It persists.</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
            Memory stays outside the model. The state survives the interface. A wake cycle only happens when the Mirror is explicitly given a reason to think.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button onClick={wake} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-950/30 px-5 py-2.5 text-xs font-semibold text-red-100 disabled:opacity-40">
            <Zap className="h-3.5 w-3.5"/>{busy?"Waking…":"Wake the Mirror"}
          </button>
          <button onClick={()=>void read()} className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] px-4 py-2.5 text-xs text-zinc-500 hover:text-white">
            <RefreshCw className="h-3.5 w-3.5"/>Refresh state
          </button>
        </div>

        {error&&<div className="mt-5 max-w-xl rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-xs text-red-200">{error}</div>}

        <div className="mt-10 grid w-full max-w-3xl gap-3 md:grid-cols-4">
          {[
            ["PULSES",String(state?.pulseCount??"—"),Radio],
            ["WAKE CYCLES",String(state?.cycleCount??"—"),Zap],
            ["BRAIN",String(brain?.active??0)+"/"+String(brain?.total??96),Brain],
            ["STATE AGE",age===null?"—":String(age)+"s",Circle]
          ].map(([label,value,Icon]:any)=><div key={label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4"><div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.16em] text-zinc-600"><Icon className="h-3 w-3"/>{label}</div><div className="mt-2 text-lg font-semibold text-zinc-200">{value}</div></div>)}
        </div>

        <div className="mt-4 grid w-full max-w-3xl gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.16em] text-zinc-600"><Moon className="h-3 w-3"/>Last action</div>
            <div className="text-sm text-zinc-300">{state?.lastAction||"No autonomous action recorded."}</div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.16em] text-zinc-600"><Brain className="h-3 w-3"/>Last thought</div>
            <div className="max-h-24 overflow-auto text-sm leading-6 text-zinc-400">{state?.lastThought||"The Mirror has no stored output yet."}</div>
          </div>
        </div>

        <div className="mt-5 text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-700">
          {(brain?.trained??0)} trained nodes · {(brain?.active??0)} active now · persistent agent: {state?.agentId||"mirror-primary"}
        </div>
      </section>
    </div>
  </main>;
}
