"use client";

import { useEffect, useState } from "react";
import { KeyRound, Play, RefreshCw, ShieldCheck, Terminal, X, Zap } from "lucide-react";

type RunState = {
  active: boolean;
  activeAgents: string[];
  activeCount: number;
};

type LabMode = "projection" | "ledger" | "sandbox" | "";

function LabButton({
  mode,
  busy,
  disabled,
  onClick,
  icon,
  label,
  workingLabel,
  tone,
}: {
  mode: Exclude<LabMode, "">;
  busy: LabMode;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  workingLabel: string;
  tone: "primary" | "secondary" | "green";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !!busy}
      aria-busy={busy === mode}
      className={`mirror-admin-action mirror-admin-action--${tone}`}
    >
      {busy === mode ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {busy === mode ? workingLabel : label}
    </button>
  );
}

export default function AdminLabControls() {
  const [busy, setBusy] = useState<LabMode>("");
  const [token, setToken] = useState("");
  const [result, setResult] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [runState, setRunState] = useState<RunState>({ active: false, activeAgents: [], activeCount: 0 });
  const [confirmProjection, setConfirmProjection] = useState(false);

  async function refreshRunState() {
    try {
      const res = await fetch("/api/mirror/simulation", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.runState) setRunState(data.runState);
    } catch {
      // The primary lab controls remain usable; a server-side guard is authoritative.
    }
  }

  useEffect(() => {
    void refreshRunState();
    const interval = window.setInterval(() => void refreshRunState(), 15000);
    return () => window.clearInterval(interval);
  }, []);

  async function mintToken() {
    setBusy("token");
    setResult(null);
    try {
      const res = await fetch("/api/mirror/access-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "temporary-lab-access" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Token generation failed (HTTP ${res.status}).`);
      setToken(data.token);
      setShow(true);
    } catch (e: any) {
      setResult({ success: false, error: e?.message || String(e) });
      setShow(true);
    } finally {
      setBusy("");
    }
  }

  async function runLab(mode: Exclude<LabMode, "">) {
    setBusy(mode);
    setResult(null);

    try {
      const body =
        mode === "projection"
          ? { mode, maxTrials: 20, maxToolSteps: 3 }
          : mode === "ledger"
            ? { mode, writers: 50, eventsPerWriter: 20 }
            : { mode, probes: 4 };

      const res = await fetch("/api/mirror/internal-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 || data.code === "SIMULATION_ALREADY_RUNNING") {
        await refreshRunState();
        throw new Error(
          data.error || "A projection run is already active. Refresh the run state before starting another.",
        );
      }

      if (res.status === 504) {
        await refreshRunState();
        throw new Error(
          "The 300-second HTTP window expired. The run may still be executing; check run state and history before retrying.",
        );
      }

      if (!res.ok || data.success === false) {
        throw new Error(data.error || data.details || `Lab run failed (HTTP ${res.status}).`);
      }

      setResult(data);
      setShow(true);
      await refreshRunState();
    } catch (e: any) {
      setResult({ success: false, error: e?.message || String(e) });
      setShow(true);
    } finally {
      setBusy("");
    }
  }

  const projectionBusy = runState.active && runState.activeAgents.includes("mirror-primary");

  return (
    <div className="mirror-lab-controls" aria-label="Administrative laboratory controls">
      <div className="mirror-admin-control-group">
        <span className="mirror-admin-group-label">Access</span>
        <button
          type="button"
          onClick={() => void mintToken()}
          disabled={!!busy}
          aria-busy={busy === "token"}
          className="mirror-admin-action mirror-admin-action--quiet"
          title="Create one temporary external control token"
        >
          {busy === "token" ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {busy === "token" ? "Minting…" : "Temp Token"}
        </button>
      </div>

      <div className="mirror-admin-control-group mirror-admin-control-group--runs">
        <span className="mirror-admin-group-label">Lab</span>
        <button
          type="button"
          onClick={() => setConfirmProjection(true)}
          disabled={!!busy || projectionBusy}
          className="mirror-admin-action mirror-admin-action--primary"
          aria-busy={busy === "projection"}
          title={projectionBusy ? "A projection session is already active for mirror-primary" : "Start the 20-chamber projection suite"}
        >
          {busy === "projection" ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {projectionBusy ? "Projection active" : busy === "projection" ? "Running…" : "20-Chamber"}
        </button>

        <LabButton
          mode="ledger"
          busy={busy}
          disabled={false}
          onClick={() => void runLab("ledger")}
          icon={<Zap className="w-3.5 h-3.5" aria-hidden="true" />}
          label="50×20 Stress"
          workingLabel="Stress…"
          tone="secondary"
        />

        <LabButton
          mode="sandbox"
          busy={busy}
          disabled={false}
          onClick={() => void runLab("sandbox")}
          icon={<Terminal className="w-3.5 h-3.5" aria-hidden="true" />}
          label="Sandbox Stress"
          workingLabel="Testing…"
          tone="green"
        />
      </div>

      {(show || token || result) && (
        <div
          className="mirror-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setShow(false);
              setToken("");
              setResult(null);
            }
          }}
        >
          <div className="mirror-admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-lab-title">
            <div className="mirror-section-heading">
              <div>
                <div className="mirror-section-kicker">Controller output</div>
                <h2 id="admin-lab-title" className="text-base font-bold mt-1">
                  Administrative Lab
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShow(false);
                  setToken("");
                  setResult(null);
                }}
                className="mirror-icon-button mirror-icon-button--quiet"
                aria-label="Close administrative lab output"
                title="Close"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {token && (
              <div className="mirror-admin-token-card">
                <div className="mirror-admin-token-title">
                  <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                  Temporary API Token
                </div>
                <input
                  aria-label="Temporary API token"
                  readOnly
                  value={token}
                  className="mirror-token-field"
                />
                <p className="text-[10px] text-slate-500 font-mono mt-2">
                  Treat this value as a credential. Revoke or rotate it after the experiment.
                </p>
              </div>
            )}

            {result && (
              <pre className="mirror-admin-result">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {confirmProjection && (
        <div
          className="mirror-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setConfirmProjection(false);
          }}
        >
          <div
            className="mirror-admin-modal mirror-admin-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="header-run-title"
            aria-describedby="header-run-copy"
          >
            <div className="mirror-section-kicker">Expensive controller action</div>
            <h2 id="header-run-title" className="text-base font-bold mt-1">Start 20-Chamber Run?</h2>
            <p id="header-run-copy" className="text-sm text-slate-400 leading-6 mt-3">
              This runs up to 20 sequential chambers for <strong>mirror-primary</strong>. The HTTP request can time out at 300 seconds while database records continue to arrive, so Mirror blocks a second projection run on the same agent.
            </p>
            <div className="mirror-modal-note mt-4">
              <span className={`mirror-status-dot ${projectionBusy ? "is-active" : "is-ready"}`} aria-hidden="true" />
              <span>{projectionBusy ? "A projection session is already active." : "No active projection session is detected."}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-5">
              <button type="button" className="mirror-secondary-button" onClick={() => setConfirmProjection(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="mirror-primary-button"
                onClick={() => void runLab("projection")}
                disabled={projectionBusy || !!busy}
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                Start run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
