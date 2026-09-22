"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => {
        if (res.ok) router.replace("/");
      })
      .catch(() => {});
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password.trim()) {
      setError("Enter the admin password to continue.");
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
        setError(data.error || "Invalid admin credentials.");
        passwordRef.current?.focus();
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
    <main className="mirror-auth min-h-dvh px-5 py-8 text-zinc-100">
      <div className="mirror-auth__glow mirror-auth__glow--top" />
      <div className="mirror-auth__glow mirror-auth__glow--bottom" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md items-center">
        <form
          onSubmit={submit}
          className="w-full rounded-[26px] border border-white/[0.08] bg-[#09090b]/90 p-7 shadow-[0_30px_100px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-8"
          aria-label="The Mirror admin sign in"
        >
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="mirror-mark" aria-hidden="true">
                <span />
              </div>
              <div>
                <div className="text-[15px] font-semibold tracking-[0.22em] text-white">THE MIRROR</div>
                <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                  Research Laboratory
                </div>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/15 bg-red-500/[0.06] px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-red-300">
              <Sparkles className="h-3 w-3" />
              Control
            </div>
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">
              Enter the Mirror.
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
              Private researcher access. One quiet door into the laboratory.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label
                htmlFor="mirror-username"
                className="mb-2 block text-[11px] font-mono uppercase tracking-[0.14em] text-zinc-500"
              >
                Username
              </label>
              <input
                id="mirror-username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="mirror-field"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="mirror-password"
                  className="block text-[11px] font-mono uppercase tracking-[0.14em] text-zinc-500"
                >
                  Password
                </label>
                <span className="text-[10px] font-mono text-zinc-600">8h session</span>
              </div>

              <div className="relative">
                <input
                  ref={passwordRef}
                  id="mirror-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  spellCheck={false}
                  required
                  aria-invalid={!!error}
                  className="mirror-field pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3.5 py-3 text-xs leading-5 text-red-200"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mirror-enter-button"
            >
              <LockKeyhole className="h-4 w-4" />
              <span>{busy ? "Opening..." : "Enter Mirror"}</span>
              <span className="mirror-enter-button__arrow">↵</span>
            </button>
          </div>

          <div className="mt-7 flex items-center gap-2 border-t border-white/[0.06] pt-5 text-[10px] font-mono text-zinc-600">
            <ShieldCheck className="h-3.5 w-3.5 text-red-400/80" />
            <span>Admin session • direct laboratory control</span>
          </div>
        </form>
      </div>
    </main>
  );
}
