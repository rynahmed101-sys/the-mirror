"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, FlaskConical, LockKeyhole, ShieldCheck } from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then((res) => {
      if (res.ok) router.replace("/");
    }).catch(() => {});
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password.trim()) {
      setError("Enter the laboratory password.");
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() || "admin", password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Invalid credentials.");
        passwordRef.current?.focus();
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Authentication service is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#050608] px-5 py-8 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md items-center">
        <form onSubmit={submit} className="w-full rounded-2xl border border-slate-800 bg-[#090b10] p-7 shadow-2xl" aria-label="Science Lab sign in">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3"><FlaskConical className="h-5 w-5 text-cyan-300" /></div>
            <div>
              <div className="text-sm font-semibold tracking-[0.18em]">THE MIRROR</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500">Math & Physics Science Lab</div>
            </div>
          </div>
          <h1 className="mt-8 text-2xl font-semibold">Open the laboratory.</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">Private researcher access to theory evaluation, evidence runs, and the isolated sandbox.</p>

          <div className="mt-7 space-y-4">
            <label className="block text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
              Researcher
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="mt-2 w-full rounded-lg border border-slate-700 bg-black/30 px-3 py-3 text-sm outline-none focus:border-cyan-700" />
            </label>
            <label className="block text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
              Password
              <div className="relative mt-2">
                <input ref={passwordRef} value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" required className="w-full rounded-lg border border-slate-700 bg-black/30 px-3 py-3 pr-11 text-sm outline-none focus:border-cyan-700" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </label>
            {error && <div role="alert" className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-3 text-xs text-rose-200">{error}</div>}
            <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 py-3 text-xs font-bold disabled:opacity-50"><LockKeyhole className="h-4 w-4" />{busy ? "Opening…" : "Enter Science Lab"}</button>
          </div>

          <div className="mt-6 flex items-center gap-2 border-t border-slate-800 pt-5 text-[10px] font-mono text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5" /> Controller session · experimental workbench
          </div>
        </form>
      </div>
    </main>
  );
}
