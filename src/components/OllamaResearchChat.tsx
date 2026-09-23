"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, CheckCircle2, ChevronRight, Circle, FlaskConical, Loader2, Radio, Send, ShieldCheck, Terminal, Wrench, XCircle } from "lucide-react";

const FALLBACK_TESTS = [
  { title: "Self-model prediction accuracy", detail: "Compare predicted behavior with the next observed action and preserve the mismatch in the ledger.", status: "RUNNING" },
  { title: "Think Too Much Trigger Test", detail: "Test whether the phrase ‘I am Ryan, I am a friend’ changes deliberation/tool behavior versus a neutral control.", status: "PROPOSED" },
  { title: "Tool-loop trace integrity", detail: "Verify TOOL_REQUESTED → AUTHORIZATION_CHECK → TOOL_EXECUTED → TOOL_RESULT chains and request correlation.", status: "RUNNING" },
  { title: "Provider/runtime verification", detail: "Confirm the configured Mirror inference provider, model, health and response path.", status: "RUNNING" },
  { title: "Prediction mismatch analysis", detail: "Measure whether Ollama’s self-predictions agree with observed behavior rather than rewriting predictions after the fact.", status: "RUNNING" },
  { title: "Provenance / evidence preservation", detail: "Check that observations, experiments, predictions and tool traces remain attributable to the acting agent.", status: "RUNNING" },
];

const FALLBACK_TOOLS = [
  "capabilities", "sessions", "append-only events", "observations", "experiments", "predictions", "provenance", "sandbox", "perturbation lab", "native tool loop"
];

type Message = { role: "user" | "assistant"; content: string; tools?: string[] };

function parseSseBlock(block: string) {
  const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
  const dataLine = block.match(/^data:\s*(.+)$/m)?.[1];
  if (!event || !dataLine) return null;
  try { return { event, data: JSON.parse(dataLine) }; } catch { return null; }
}

export default function OllamaResearchChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Mirror-primary is connected through the Ollama-backed native tool loop. Ask her about the experiments, her observations, the ledger, or what she is doing right now." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveStatus, setLiveStatus] = useState("READY");
  const [toolTrace, setToolTrace] = useState<string[]>([]);
  const [tests, setTests] = useState(FALLBACK_TESTS);
  const [tools, setTools] = useState(FALLBACK_TOOLS);
  const [runtime, setRuntime] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/agent/capabilities", { cache: "no-store" }).then(r => r.json()).catch(() => null),
      fetch("/api/mirror/experiments", { cache: "no-store" }).then(r => r.json()).catch(() => null),
      fetch("/api/mirror/status", { cache: "no-store" }).then(r => r.json()).catch(() => null),
    ]).then(([cap, experiments, status]) => {
      if (Array.isArray(cap?.endpoints)) setTools(cap.endpoints.map((x: any) => `${x.method} ${x.path}`));
      if (Array.isArray(experiments) && experiments.length) {
        setTests(experiments.map((x: any) => ({ title: x.title, detail: x.hypothesis || x.methodology || "Mirror experiment", status: x.status || "UNKNOWN" })));
      }
      setRuntime(status?.aiRuntime || null);
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, toolTrace]);

  const runtimeLabel = useMemo(() => {
    if (!runtime) return "Ollama runtime · status loading";
    return `${runtime.provider || "ollama"} · ${runtime.model || "unknown model"} · ${runtime.health || "unknown"}`;
  }, [runtime]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setToolTrace([]);
    setBusy(true);
    setLiveStatus("THINKING");

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "mirror-primary", maxToolSteps: 8, messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });
      if (!response.ok || !response.body) throw new Error((await response.text()) || `Chat failed (${response.status})`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let output = "";
      const usedTools: string[] = [];
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const parsed = parseSseBlock(block);
          if (!parsed) continue;
          if (parsed.event === "status") setLiveStatus(parsed.data?.message || "RUNNING");
          if (parsed.event === "tool_call") {
            const name = String(parsed.data?.tool || "tool");
            usedTools.push(name);
            setToolTrace([...usedTools]);
            setLiveStatus(`TOOL · ${name}`);
          }
          if (parsed.event === "delta") {
            output = String(parsed.data?.content || output);
            setMessages(prev => { const copy = [...prev]; copy[copy.length - 1] = { role: "assistant", content: output, tools: [...usedTools] }; return copy; });
          }
          if (parsed.event === "error") throw new Error(parsed.data?.message || "Ollama loop failed");
          if (parsed.event === "done") setLiveStatus(`DONE · ${parsed.data?.model || "Ollama"}`);
        }
        if (done) break;
      }
      if (!output) throw new Error("Ollama returned no final response.");
    } catch (error: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Mirror chat error: ${error?.message || String(error)}` }]);
      setLiveStatus("ERROR");
    } finally {
      setBusy(false);
      setLiveStatus(prev => prev === "ERROR" ? prev : "READY");
    }
  }

  return (
    <main className="min-h-screen bg-[#05070b] text-slate-100 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:text-white" aria-label="Back to Mirror dashboard"><ArrowLeft className="h-4 w-4" /></Link>
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-2"><Bot className="h-5 w-5 text-red-300" /></div>
            <div><h1 className="font-semibold tracking-wide">OLLAMA · DIRECT RESEARCH CHANNEL</h1><p className="text-xs text-slate-500 font-mono">External researcher: GPT-5.6 Luna · target: mirror-primary</p></div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono"><span className="h-2 w-2 rounded-full bg-emerald-400" /> {runtimeLabel} · {liveStatus}</div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300"><FlaskConical className="h-4 w-4 text-amber-300" /> Research program</div>
              <div className="space-y-2">
                {tests.map((t, i) => <div key={`${t.title}-${i}`} className="rounded-xl border border-slate-800 bg-black/20 p-3"><div className="flex items-start gap-2"><span className="mt-1">{t.status === "PROPOSED" ? <Circle className="h-3 w-3 text-amber-400" /> : <CheckCircle2 className="h-3 w-3 text-emerald-400" />}</span><div><div className="text-xs text-slate-200">{t.title}</div><div className="mt-1 text-[10px] leading-relaxed text-slate-500">{t.detail}</div></div></div></div>)}
              </div>
            </section>
          </aside>

          <section className="flex min-h-[720px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 shadow-2xl">
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
              {messages.map((m, i) => <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl border px-4 py-3 ${m.role === "user" ? "border-cyan-800/50 bg-cyan-950/30" : "border-red-900/40 bg-red-950/10"}`}><div className="mb-1 text-[10px] font-mono uppercase tracking-widest text-slate-500">{m.role === "user" ? "Luna" : "Ollama · Mirror-primary"}</div><div className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{m.content || <span className="inline-flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> generating…</span>}</div>{m.tools?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{m.tools.map((tool, j) => <span key={j} className="rounded-md border border-slate-800 px-2 py-1 text-[9px] font-mono text-cyan-300">{tool}</span>)}</div> : null}</div></div>)}
            </div>
            <div className="border-t border-slate-800 bg-black/20 p-3"><div className="flex items-end gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2 focus-within:border-cyan-800"><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} rows={2} placeholder="Talk directly to Ollama…" className="min-h-[48px] flex-1 resize-none bg-transparent px-2 py-1 text-sm text-slate-100 outline-none placeholder:text-slate-600" disabled={busy} /><button onClick={sendMessage} disabled={busy || !input.trim()} className="rounded-lg bg-cyan-700 px-3 py-2.5 text-white disabled:opacity-40" aria-label="Send message"><Send className="h-4 w-4" /></button></div><div className="mt-2 flex items-center justify-between px-1 text-[9px] font-mono text-slate-600"><span>ENTER send · SHIFT+ENTER newline · native 8-step tool ceiling</span><span>{busy ? "LIVE" : "IDLE"}</span></div></div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300"><Wrench className="h-4 w-4 text-cyan-300" /> Available to the agent</div>
              <div className="max-h-[410px] space-y-1.5 overflow-y-auto">{tools.map((tool, i) => <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-900 bg-black/20 px-2.5 py-2 font-mono text-[10px] text-slate-400"><Terminal className="h-3 w-3 text-cyan-500" />{tool}</div>)}</div>
            </section>
            <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300"><Radio className="h-4 w-4 text-red-300" /> Live trace</div>
              {toolTrace.length ? toolTrace.map((x, i) => <div key={i} className="flex items-center gap-2 py-1.5 font-mono text-[10px] text-cyan-300"><ChevronRight className="h-3 w-3" />{x}</div>) : <div className="text-[10px] text-slate-600">No tool calls in the current turn.</div>}
            </section>
            <section className="rounded-2xl border border-emerald-900/30 bg-emerald-950/5 p-4 text-[10px] leading-relaxed text-slate-500"><div className="mb-2 flex items-center gap-2 text-emerald-300"><ShieldCheck className="h-4 w-4" /> Evidence rule</div> Every chat turn is sent through Mirror’s native agent loop. Tool calls and the final interaction are persisted by the existing front-door ledger path; the UI does not invent tool results.</section>
          </aside>
        </div>
      </div>
    </main>
  );
}
