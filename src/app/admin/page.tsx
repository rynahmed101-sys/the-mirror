"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, LockKeyhole, ShieldCheck } from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => { if (res.ok) router.replace("/"); })
      .catch(() => {});
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Invalid admin credentials.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Unable to reach the authentication endpoint.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050711] text-slate-100 flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-md bg-[#090d19] border border-slate-800 rounded-2xl p-7 shadow-2xl space-y-5">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-400 p-[1px]">
            <div className="w-full h-full bg-[#090d19] rounded-[15px] flex items-center justify-center">
              <Brain className="w-7 h-7 text-cyan-400" />
            </div>
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-[0.16em]">THE MIRROR</h1>
          <p className="mt-2 text-xs font-mono text-slate-500">RESEARCHER ADMIN</p>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-mono">Username</label>
          <input value={username} onChange={(e)=>setUsername(e.target.value)} autoComplete="username"
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm outline-none focus:border-cyan-500" />
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-mono">Password</label>
          <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="current-password"
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm outline-none focus:border-cyan-500" />
        </div>

        {error && <div className="rounded-lg border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">{error}</div>}

        <button type="submit" disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-lg px-4 py-3 text-sm">
          <LockKeyhole className="w-4 h-4" />
          {busy ? "Authenticating..." : "Enter Mirror"}
        </button>

        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Admin session controls the Mirror directly
        </div>
      </form>
    </main>
  );
}
