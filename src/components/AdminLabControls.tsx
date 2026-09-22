"use client";

import { useState } from "react";
import { KeyRound, Play, ShieldCheck, Terminal, Zap, X } from "lucide-react";

export default function AdminLabControls() {
  const [busy, setBusy] = useState("");
  const [token, setToken] = useState("");
  const [result, setResult] = useState<any>(null);
  const [show, setShow] = useState(false);

  async function mintToken() {
    setBusy("token");
    try {
      const res = await fetch("/api/mirror/access-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "temporary-lab-access" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Token generation failed.");
      setToken(data.token);
      setShow(true);
    } catch (e:any) {
      setResult({ success:false, error:e?.message || String(e) });
    } finally {
      setBusy("");
    }
  }

  async function runLab(mode:string) {
    setBusy(mode);
    setResult(null);
    try {
      const body = mode === "projection"
        ? { mode, maxTrials: 20, maxToolSteps: 3 }
        : mode === "ledger"
        ? { mode, writers: 50, eventsPerWriter: 20 }
        : { mode, probes: 4 };
      const res = await fetch("/api/mirror/internal-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || data.details || "Lab run failed.");
      setResult(data);
    } catch (e:any) {
      setResult({ success:false, error:e?.message || String(e) });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={mintToken}
        disabled={!!busy}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-200 disabled:opacity-50"
        title="Create one temporary external control token"
      >
        <KeyRound className="w-3.5 h-3.5 text-amber-300" />
        {busy === "token" ? "Minting..." : "Temp Token"}
      </button>

      <button
        onClick={() => runLab("projection")}
        disabled={!!busy}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-cyan-700 hover:bg-cyan-600 text-xs font-mono font-bold disabled:opacity-50"
      >
        <Play className="w-3.5 h-3.5" />
        {busy === "projection" ? "Running..." : "20-Chamber"}
      </button>

      <button
        onClick={() => runLab("ledger")}
        disabled={!!busy}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 text-xs font-mono font-bold disabled:opacity-50"
      >
        <Zap className="w-3.5 h-3.5" />
        {busy === "ledger" ? "Stress..." : "50×20 Stress"}
      </button>

      <button
        onClick={() => runLab("sandbox")}
        disabled={!!busy}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-xs font-mono font-bold disabled:opacity-50"
      >
        <Terminal className="w-3.5 h-3.5" />
        {busy === "sandbox" ? "Testing..." : "Sandbox Stress"}
      </button>

      {(show || token || result) && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#090d19] shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> ADMIN LAB RESULT
              </div>
              <button onClick={() => { setShow(false); setToken(""); }} className="p-1.5 rounded hover:bg-slate-800">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {token && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase text-amber-300 font-mono">Temporary API Token</div>
                <input readOnly value={token} className="w-full bg-slate-950 border border-amber-800 rounded-lg p-3 text-xs font-mono text-amber-200" />
                <div className="text-[10px] text-slate-500 font-mono">This is a control token. Rotate/revoke it after the experiment.</div>
              </div>
            )}

            {result && (
              <pre className="max-h-[60vh] overflow-auto rounded-lg border border-slate-800 bg-black/30 p-4 text-[10px] text-slate-300 whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}

            {!token && !result && (
              <div className="text-xs text-slate-500 font-mono flex items-center gap-2"><ShieldCheck className="w-4 h-4"/> Running admin-authorized laboratory operation.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
