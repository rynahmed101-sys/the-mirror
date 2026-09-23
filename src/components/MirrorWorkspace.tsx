"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Brain, ChevronRight, CircleDot, FlaskConical, KeyRound, Paperclip, Play, Plus, Search, Send, Settings2, ShieldCheck, Sparkles, Upload, Wrench, X } from "lucide-react";

type Message={role:"user"|"assistant";content:string;tools?:string[]};
type Plugin={id:string;name:string;category:string;description:string;cost:string;mutatesState:boolean;supportsAll:boolean};

export default function MirrorWorkspace(){
  const [tab,setTab]=useState<"chat"|"lab"|"brain"|"knowledge"|"admin">("chat");
  const [messages,setMessages]=useState<Message[]>([{role:"assistant",content:"THE MIRROR is ready. Ask a question, run a laboratory test, inspect the 96-node brain shell, or search a connected knowledge source."}]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [trace,setTrace]=useState<string[]>([]);
  const [plugins,setPlugins]=useState<Plugin[]>([]);
  const [selectedPlugins,setSelectedPlugins]=useState<string[]>([]);
  const [labBusy,setLabBusy]=useState(false);
  const [labResult,setLabResult]=useState<any>(null);
  const [knowledgeConnectors,setKnowledgeConnectors]=useState<any[]>([]);
  const [knowledgeQuery,setKnowledgeQuery]=useState("");
  const [knowledgeConnector,setKnowledgeConnector]=useState("huggingface-models");
  const [knowledgeResults,setKnowledgeResults]=useState<any[]>([]);
  const [keyPreview,setKeyPreview]=useState<string|null>(null);
  const [newKey,setNewKey]=useState("");
  const [link,setLink]=useState<any>(null);
  const [attachment,setAttachment]=useState<any>(null);
  const [brain,setBrain]=useState<any>(null);

  useEffect(()=>{
    Promise.all([
      fetch("/api/lab/plugins",{cache:"no-store"}).then(r=>r.json()).catch(()=>null),
      fetch("/api/knowledge/connectors",{cache:"no-store"}).then(r=>r.json()).catch(()=>null),
      fetch("/api/mirror/runtime-config",{cache:"no-store"}).then(r=>r.json()).catch(()=>null),\n      fetch("/api/brain",{cache:"no-store"}).then(r=>r.json()).catch(()=>null),
    ]).then(([lab,knowledge,config,brainData])=>{
      if(Array.isArray(lab?.plugins)) setPlugins(lab.plugins);
      if(Array.isArray(knowledge?.connectors)) setKnowledgeConnectors(knowledge.connectors);
      setKeyPreview(config?.keyPreview||null);
      if(brainData?.definition) setBrain(brainData);
    });
  },[]);

  const workflow=["observe","retrieve_knowledge","think","visualize","challenge","act","record","evaluate"];

  async function sendMessage(){
    const text=input.trim(); if(!text||busy)return;
    const next=[...messages,{role:"user" as const,content:text}];
    setMessages(next);setInput("");setTrace([]);setBusy(true);
    try{
      const res=await fetch("/api/agent/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId:"mirror-primary",maxToolSteps:8,messages:next.map(m=>({role:m.role,content:m.content}))})});
      if(!res.ok||!res.body) throw new Error(await res.text()||"Mirror chat failed");
      const reader=res.body.getReader();const decoder=new TextDecoder();let buffer="";let output="";const used:string[]=[];
      setMessages(prev=>[...prev,{role:"assistant",content:""}]);
      while(true){
        const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});
        const blocks=buffer.split("\n\n");buffer=blocks.pop()||"";
        for(const block of blocks){
          const ev=block.match(/^event:\s*(.+)$/m)?.[1]?.trim();const line=block.match(/^data:\s*(.+)$/m)?.[1];if(!ev||!line)continue;
          let data:any;try{data=JSON.parse(line)}catch{continue}
          if(ev==="tool_call"){used.push(String(data?.tool||"tool"));setTrace([...used]);}
          if(ev==="delta"){output=String(data?.content||output);setMessages(prev=>{const c=[...prev];c[c.length-1]={role:"assistant",content:output,tools:[...used]};return c;});}
          if(ev==="error")throw new Error(data?.message||"Agent loop failed");
        }
        if(done)break;
      }
    }catch(error:any){setMessages(prev=>[...prev,{role:"assistant",content:"Mirror error: "+(error?.message||String(error))}]);}
    finally{setBusy(false);}
  }

  async function runLab(){
    if(labBusy)return;
    setLabBusy(true);setLabResult(null);
    try{
      const res=await fetch("/api/lab/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pluginIds:selectedPlugins.length?selectedPlugins:undefined,agentId:"mirror-primary"})});
      const data=await res.json(); if(!res.ok)throw new Error(data.error||"Lab run failed");
      setLabResult(data);
    }catch(error:any){setLabResult({error:error?.message||String(error)});}
    finally{setLabBusy(false);}
  }

  async function saveOllamaKey(){
    if(!newKey.trim())return;
    const res=await fetch("/api/mirror/runtime-config",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ollamaApiKey:newKey.trim()})});
    const data=await res.json();if(res.ok){setKeyPreview(data.keyPreview);setNewKey("");}
  }

  async function createAccessLink(){
    const res=await fetch("/api/mirror/access-link",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId:"agent_link_"+Math.random().toString(36).slice(2,10),label:"Mirror external laboratory",ttlHours:24})});
    const data=await res.json();if(res.ok)setLink(data.capability);
  }

  async function searchKnowledge(){
    if(!knowledgeQuery.trim())return;
    const res=await fetch("/api/knowledge/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({connector:knowledgeConnector,query:knowledgeQuery.trim()})});
    const data=await res.json();setKnowledgeResults(res.ok?(data.results||[]):[{error:data.error||"Search failed"}]);
  }

  async function uploadFile(file:File){
    const fd=new FormData();fd.append("file",file);
    const res=await fetch("/api/attachments",{method:"POST",body:fd});const data=await res.json();
    setAttachment(res.ok?data.attachment:{error:data.error||"Upload failed"});
  }

  const nodes=useMemo(()=>brain?.definition?.nodes||[],[brain]);

  return <main className="min-h-dvh bg-[#050505] text-zinc-100">
    <div className="grid min-h-dvh lg:grid-cols-[220px_minmax(0,1fr)_300px]">
      <aside className="border-r border-white/[0.06] bg-[#09090b] p-3 lg:p-4">
        <div className="mb-5 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-red-500/25 bg-red-500/10"><Sparkles className="h-4 w-4 text-red-300"/></div>
          <div><div className="text-sm font-semibold tracking-[0.18em]">THE MIRROR</div><div className="text-[9px] uppercase tracking-[0.16em] text-zinc-600">Self-Observation Lab</div></div>
        </div>
        <nav className="space-y-1">
          {[["chat","Autopilot",Sparkles],["lab","Laboratory",FlaskConical],["brain","Brain 96",Brain],["knowledge","Knowledge",Search],["admin","Admin",Settings2]].map(([id,label,Icon]:any)=><button key={id} onClick={()=>setTab(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs ${tab===id?"bg-red-950/40 text-red-200 border border-red-500/20":"text-zinc-500 hover:text-zinc-200 border border-transparent"}`}><Icon className="h-4 w-4"/>{label}</button>)}
        </nav>
        <div className="mt-8 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-[10px] text-zinc-600">
          <div className="mb-2 flex items-center gap-2 text-zinc-400"><Activity className="h-3.5 w-3.5 text-red-400"/> Autopilot sequence</div>
          {workflow.map((x,i)=><div key={x} className="flex items-center gap-2 py-1"><span className="font-mono text-zinc-700">{String(i+1).padStart(2,"0")}</span>{x}</div>)}
        </div>
      </aside>

      <section className="min-w-0 bg-[#070708]">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 lg:px-6">
          <div><div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-600">Research Workspace</div><div className="mt-1 text-sm font-semibold">{tab==="chat"?"Mirror Autopilot":tab==="lab"?"Laboratory":tab==="brain"?"96-Node Brain Shell":tab==="knowledge"?"Knowledge Fabric":"Control Center"}</div></div>
          <div className="flex items-center gap-2 rounded-full border border-white/[0.06] px-2.5 py-1.5 text-[9px] font-mono text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-red-400"/> OLLAMA · MIRROR</div>
        </header>

        {tab==="chat"&&<div className="flex min-h-[calc(100dvh-58px)] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 lg:p-8">
            <div className="mx-auto max-w-3xl space-y-5">{messages.map((m,i)=><div key={i} className={m.role==="user"?"ml-auto max-w-[82%]":"max-w-[88%]"}><div className={m.role==="user"?"rounded-2xl bg-zinc-800 px-4 py-3":"rounded-2xl border border-red-500/10 bg-red-950/5 px-4 py-3"}><div className="mb-2 text-[9px] font-mono uppercase tracking-[0.16em] text-zinc-600">{m.role==="user"?"You":"Mirror"}</div><div className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">{m.content}</div>{m.tools?.length?<div className="mt-3 flex flex-wrap gap-1">{m.tools.map(t=><span key={t} className="rounded-md border border-white/[0.06] px-2 py-1 text-[9px] font-mono text-red-300">{t}</span>)}</div>:null}</div></div>)}</div>
          </div>
          <div className="border-t border-white/[0.06] p-3 lg:p-5"><div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-white/[0.08] bg-[#0b0b0d] p-2 shadow-2xl"><label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-zinc-600 hover:text-zinc-200"><Paperclip className="h-4 w-4"/><input type="file" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)uploadFile(f)}}/></label><textarea rows={2} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}}} placeholder="Message Mirror…" className="min-h-[46px] flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-zinc-700"/><button onClick={sendMessage} disabled={busy||!input.trim()} className="grid h-11 w-11 place-items-center rounded-xl bg-red-700 text-white disabled:opacity-30"><Send className="h-4 w-4"/></button></div></div>
        </div>}

        {tab==="lab"&&<div className="p-4 lg:p-8"><div className="mx-auto max-w-4xl"><div className="mb-5 rounded-2xl border border-white/[0.06] bg-[#0b0b0d] p-5"><div className="flex items-center justify-between"><div><div className="text-lg font-semibold">Laboratory plugins</div><div className="mt-1 text-xs text-zinc-600">Run one, several, or the complete bounded suite through the same ledger.</div></div><button onClick={runLab} disabled={labBusy} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-semibold disabled:opacity-40"><Play className="h-4 w-4"/>{labBusy?"Running":"Run selected"}</button></div></div><div className="grid gap-3 md:grid-cols-2">{plugins.map(p=><button key={p.id} onClick={()=>setSelectedPlugins(s=>s.includes(p.id)?s.filter(x=>x!==p.id):[...s,p.id])} className={`rounded-2xl border p-4 text-left ${selectedPlugins.includes(p.id)?"border-red-500/30 bg-red-950/10":"border-white/[0.06] bg-[#0b0b0d]"}`}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold">{p.name}</div><div className="mt-1 text-xs leading-5 text-zinc-500">{p.description}</div></div><CircleDot className={`h-4 w-4 ${selectedPlugins.includes(p.id)?"text-red-400":"text-zinc-700"}`}/></div><div className="mt-3 flex gap-2 text-[9px] font-mono uppercase tracking-wider text-zinc-600"><span>{p.category}</span><span>·</span><span>{p.cost}</span></div></button>)}</div>{labResult&&<pre className="mt-4 overflow-auto rounded-2xl border border-white/[0.06] bg-black p-4 text-[10px] leading-5 text-zinc-400">{JSON.stringify(labResult,null,2)}</pre>}</div></div>}

        {tab==="brain"&&<div className="p-4 lg:p-8"><div className="mx-auto max-w-5xl"><div className="mb-5 rounded-2xl border border-white/[0.06] bg-[#0b0b0d] p-5"><div className="flex items-center gap-3"><Brain className="h-5 w-5 text-red-300"/><div><div className="text-lg font-semibold">96-node operative brain</div><div className="text-xs text-zinc-600">Six controller layers × sixteen behavioral columns. Ollama remains the language engine; Brain96 selects and adapts operational modules.</div></div></div><div className="mt-4 flex flex-wrap gap-2 text-[9px] font-mono text-zinc-500"><span>{brain?.summary?.active||0} active</span><span>·</span><span>{brain?.summary?.trained||0} trained</span><span>·</span><span>{brain?.summary?.left||48} left</span><span>·</span><span>{brain?.summary?.right||48} right</span></div></div><div className="grid grid-cols-8 gap-2 md:grid-cols-12">{nodes.map((n:any)=><div key={n.id} className="aspect-square rounded-lg border border-white/[0.05] bg-[#0b0b0d] p-1 text-center"><div className="text-[8px] font-mono text-zinc-700">{String(n.index+1).padStart(2,"0")}</div><div className="mt-1 truncate text-[7px] text-zinc-500">{n.label}</div><div className="mt-1 text-[7px] font-mono text-red-300">{n.hemisphere[0].toUpperCase()} {n.tendency.toFixed(2)}</div></div>)}</div></div></div>}

        {tab==="knowledge"&&<div className="p-4 lg:p-8"><div className="mx-auto max-w-4xl"><div className="rounded-2xl border border-white/[0.06] bg-[#0b0b0d] p-5"><div className="text-lg font-semibold">Knowledge fabric</div><div className="mt-1 text-xs text-zinc-600">Live connectors are kept outside the core inference engine so evidence can be attributed independently.</div><div className="mt-4 flex gap-2"><select value={knowledgeConnector} onChange={e=>setKnowledgeConnector(e.target.value)} className="rounded-xl border border-white/[0.08] bg-black px-3 py-2 text-xs">{knowledgeConnectors.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><input value={knowledgeQuery} onChange={e=>setKnowledgeQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")searchKnowledge()}} placeholder="Search models, datasets, papers, GitHub…" className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black px-3 py-2 text-xs outline-none"/><button onClick={searchKnowledge} className="rounded-xl bg-red-700 px-4 py-2 text-xs">Search</button></div><div className="mt-5 space-y-2">{knowledgeResults.map((r,i)=><div key={i} className="rounded-xl border border-white/[0.06] p-3 text-xs text-zinc-400"><pre className="whitespace-pre-wrap">{JSON.stringify(r,null,2)}</pre></div>)}</div></div></div></div>}

        {tab==="admin"&&<div className="p-4 lg:p-8"><div className="mx-auto max-w-4xl space-y-4"><div className="rounded-2xl border border-white/[0.06] bg-[#0b0b0d] p-5"><div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-red-300"/> Ollama runtime key</div><div className="mt-1 text-xs text-zinc-600">Stored encrypted server-side. The browser only sees a masked preview.</div><div className="mt-4 flex gap-2"><input type="password" value={newKey} onChange={e=>setNewKey(e.target.value)} placeholder="Paste Ollama key" className="flex-1 rounded-xl border border-white/[0.08] bg-black px-3 py-2 text-sm outline-none"/><button onClick={saveOllamaKey} className="rounded-xl bg-red-700 px-4 py-2 text-xs">Save key</button></div><div className="mt-3 text-[10px] font-mono text-zinc-500">Current: {keyPreview||"not configured"}</div><a href="/control" className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-3 py-2 text-[10px] text-zinc-400 hover:text-white"><Wrench className="h-3 w-3"/> Open full forensic control plane</a></div><div className="rounded-2xl border border-white/[0.06] bg-[#0b0b0d] p-5"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-red-300"/> External laboratory access</div><div className="mt-1 text-xs text-zinc-600">Generate a revocable, expirable link capability for another AI or guest researcher.</div><button onClick={createAccessLink} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs"><Plus className="h-4 w-4"/> Create access link</button>{link&&<div className="mt-3 rounded-xl border border-red-500/15 bg-red-950/10 p-3"><div className="text-[10px] text-zinc-500">Capability link</div><div className="mt-1 break-all font-mono text-xs text-red-200">{link.url}</div><div className="mt-2 text-[9px] text-zinc-600">Expires {new Date(link.expiresAt).toLocaleString()}</div></div>}</div>{attachment&&<div className="rounded-2xl border border-white/[0.06] bg-[#0b0b0d] p-5 text-xs"><div className="flex items-center gap-2"><Upload className="h-4 w-4 text-red-300"/> Attachment</div><pre className="mt-2 whitespace-pre-wrap text-zinc-500">{JSON.stringify(attachment,null,2)}</pre></div>}</div></div>}
      </section>

      <aside className="hidden border-l border-white/[0.06] bg-[#09090b] p-4 lg:block">
        <div className="mb-4 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-600">Live inspector</div>
        {tab==="chat"&&<><div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4"><div className="mb-3 text-xs font-semibold">Tool trace</div>{trace.length?trace.map((x,i)=><div key={i} className="flex items-center gap-2 py-1.5 text-[10px] font-mono text-red-300"><ChevronRight className="h-3 w-3"/>{x}</div>):<div className="text-[10px] text-zinc-700">Waiting for the next tool action.</div>}</div><div className="mt-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4"><div className="text-xs font-semibold">Attachments</div><div className="mt-2 text-[10px] text-zinc-700">Files can be attached with the paperclip in chat.</div></div></>}
        {tab==="lab"&&<div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4"><div className="text-xs font-semibold">Selected</div><div className="mt-2 text-[10px] text-zinc-500">{selectedPlugins.length?selectedPlugins.join(", "):"All bounded plugins"}</div></div>}
        {tab==="brain"&&<div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[10px] text-zinc-600"><div className="mb-2 text-xs font-semibold text-zinc-400">Brain status</div>Operational. {brain?.summary?.active||0} active nodes, {brain?.summary?.trained||0} with behavioral exposure. Per-node causal status remains untested until controlled node-level comparisons exist.</div>}
        {tab==="knowledge"&&<div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[10px] text-zinc-600"><div className="mb-2 text-xs font-semibold text-zinc-400">Connectors</div>{knowledgeConnectors.map(c=><div key={c.id} className="py-1">{c.name}</div>)}</div>}
        {tab==="admin"&&<div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-[10px] text-zinc-600"><div className="mb-2 text-xs font-semibold text-zinc-400">Control plane</div>Provider key, external access links, attachments, and laboratory execution remain server-authorized.</div>}
      </aside>
    </div>
  </main>
}
