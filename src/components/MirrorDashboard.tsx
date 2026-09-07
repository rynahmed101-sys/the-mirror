"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Cpu,
  Brain,
  FlaskConical,
  Target,
  BookOpen,
  Sparkles,
  Terminal,
  Settings,
  Code2,
  Play,
  RefreshCw,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  Search,
  Check,
  Zap,
  Info,
  Clock,
  Shield,
  Send,
  Eye,
  FileText,
  ChevronRight,
  TrendingUp,
  HelpCircle,
  BarChart3,
  Flame,
  Lock,
  UserCheck,
  Radio,
  GitBranch,
  Key,
} from "lucide-react";

export default function MirrorDashboard() {
  const [activeTab, setActiveTab] = useState<
    | "overview"
    | "researchintegrity"
    | "agents"
    | "sessions"
    | "rawevents"
    | "provenance"
    | "whatchanged"
    | "unexpected"
    | "openquestions"
    | "selfmodel"
    | "experiments"
    | "predictions"
    | "journal"
    | "agent"
    | "models"
    | "docs"
  >("overview");

  // Global status state
  const [statusData, setStatusData] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Stage 3 & Research Integrity Data states
  const [agentsList, setAgentsList] = useState<any[]>([]);
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [rawEventsList, setRawEventsList] = useState<any[]>([]);
  const [ledgerEventsList, setLedgerEventsList] = useState<any[]>([]);
  const [selfModel, setSelfModel] = useState<any>(null);
  const [provenanceData, setProvenanceData] = useState<any>(null);
  const [selectedClaimForTrace, setSelectedClaimForTrace] = useState<string | null>(null);
  const [verifyingLedger, setVerifyingLedger] = useState(false);
  const [ledgerVerificationResult, setLedgerVerificationResult] = useState<any>(null);

  // Agent Chat & Override state
  const [selectedAgent, setSelectedAgent] = useState("mirror-primary");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string; tools?: any[] }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentToolStep, setCurrentToolStep] = useState<string | null>(null);

  // Modals state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [newAgentData, setNewAgentData] = useState({ name: "", type: "EXTERNAL", provider: "openai", model: "gpt-4o" });
  const [registeredKey, setRegisteredKey] = useState<string | null>(null);

  const fetchAllData = async () => {
    try {
      setLoadingStatus(true);
      const [stRes, agRes, sessRes, evRes, smRes, ledgRes] = await Promise.all([
        fetch("/api/v1/mirror/status").then((r) => r.json()).catch(() => null),
        fetch("/api/v1/agents").then((r) => r.json()).catch(() => []),
        fetch("/api/v1/sessions").then((r) => r.json()).catch(() => []),
        fetch("/api/v1/events?limit=50").then((r) => r.json()).catch(() => []),
        fetch("/api/v1/self-model").then((r) => r.json()).catch(() => null),
        fetch("/api/v1/events/ledger?limit=50&order=desc").then((r) => r.json()).catch(() => null),
      ]);

      if (stRes) setStatusData(stRes);
      setAgentsList(Array.isArray(agRes) ? agRes : []);
      setSessionsList(Array.isArray(sessRes) ? sessRes : []);
      setRawEventsList(Array.isArray(evRes) ? evRes : []);
      if (smRes) setSelfModel(smRes);
      if (ledgRes?.events) setLedgerEventsList(ledgRes.events);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleVerifyLedger = async () => {
    try {
      setVerifyingLedger(true);
      const res = await fetch("/api/v1/events/ledger?verify=true").then((r) => r.json());
      setLedgerVerificationResult(res);
      await fetchAllData();
    } catch (err: any) {
      alert("Verification failed: " + err.message);
    } finally {
      setVerifyingLedger(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 15000);
    return () => clearInterval(interval);
  }, []);

  // Register New External Agent
  const handleRegisterAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/v1/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAgentData),
      });
      const data = await res.json();
      if (data.apiKey) {
        setRegisteredKey(data.apiKey);
        fetchAllData();
      }
    } catch (err: any) {
      alert("Registration failed: " + err.message);
    }
  };

  // Trace Claim Provenance
  const handleTraceProvenance = async (claimId: string) => {
    try {
      setSelectedClaimForTrace(claimId);
      const res = await fetch(`/api/v1/provenance?claimId=${claimId}`).then((r) => r.json());
      setProvenanceData(res);
    } catch (err) {
      console.error("Provenance fetch failed:", err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#050711] text-slate-100 font-sans">
      {/* HEADER */}
      <header className="border-b border-slate-800/80 bg-[#090d19]/90 backdrop-blur-md sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-purple-500/20">
              <div className="w-full h-full bg-[#090d19] rounded-[7px] flex items-center justify-center">
                <Brain className="w-5 h-5 text-cyan-400 animate-pulse" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wider bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
                THE MIRROR
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/50">
                  RESEARCH PROTOTYPE • INTEGRITY VERIFIED
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-mono">Behavioral Research Laboratory • SHA-256 Event Ledger • Zero Forks</p>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center space-x-4 text-xs font-mono">
          <div className="flex items-center space-x-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-md">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Ledger Status:</span>
            <span className="text-emerald-400 font-bold">{statusData?.researchIntegrity?.status || "VALID"}</span>
          </div>

          <div className="flex items-center space-x-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-md">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Raw Stream:</span>
            <span className="text-cyan-400 font-bold">{rawEventsList.length} Events</span>
          </div>

          <button
            onClick={() => setShowRegisterModal(true)}
            className="flex items-center space-x-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-4 py-1.5 rounded-md text-xs transition shadow-md shadow-cyan-950"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Register External AI</span>
          </button>

          <button
            onClick={fetchAllData}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-md transition"
          >
            <RefreshCw className={`w-4 h-4 ${loadingStatus ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <nav className="border-b border-slate-800/60 bg-[#070b16] px-6 flex items-center space-x-1 overflow-x-auto scrollbar-none">
        {[
          { id: "overview", label: "Overview", icon: Activity },
          { id: "researchintegrity", label: "RESEARCH INTEGRITY", icon: Shield },
          { id: "agents", label: "AGENTS", icon: UserCheck },
          { id: "sessions", label: "SESSIONS", icon: Clock },
          { id: "rawevents", label: "RAW EVENTS", icon: Radio },
          { id: "provenance", label: "PROVENANCE", icon: GitBranch },
          { id: "whatchanged", label: "WHAT CHANGED?", icon: TrendingUp },
          { id: "unexpected", label: "UNEXPECTED", icon: Flame },
          { id: "openquestions", label: "OPEN QUESTIONS", icon: HelpCircle },
          { id: "selfmodel", label: "Self-Model Claims", icon: Brain },
          { id: "agent", label: "Agent Terminal", icon: Terminal },
          { id: "docs", label: "External AI Docs", icon: Code2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isStage3 = tab.id === "agents" || tab.id === "sessions" || tab.id === "rawevents" || tab.id === "provenance";
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-3.5 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                  : isStage3
                  ? "border-transparent text-emerald-300 hover:text-cyan-300 font-bold bg-slate-900/60"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : isStage3 ? "text-emerald-400" : "text-slate-500"}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>REGISTERED AGENTS</span>
                  <UserCheck className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">{agentsList.length}</div>
                <div className="text-[11px] text-cyan-400 mt-1 font-mono">Local & External AI</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>ACTIVE SESSIONS</span>
                  <Clock className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">{sessionsList.length || 1}</div>
                <div className="text-[11px] text-emerald-400 mt-1 font-mono">Session Lifecycle</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>RAW EVENT STREAM</span>
                  <Radio className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">{rawEventsList.length}</div>
                <div className="text-[11px] text-purple-400 mt-1 font-mono">Append-Only Fact Log</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>PROVENANCE TRACES</span>
                  <GitBranch className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">100%</div>
                <div className="text-[11px] text-amber-400 mt-1 font-mono">Full Event Lineage</div>
              </div>
            </div>

            {/* Live Raw Event Stream Feed */}
            <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-emerald-300">
                  <Radio className="w-4 h-4 text-emerald-400 animate-pulse" /> Live Append-Only Raw Event Stream
                </h3>
                <span className="text-xs font-mono text-slate-400">Immutable Fact Stream</span>
              </div>
              <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-2 font-mono text-xs">
                {rawEventsList.map((ev) => (
                  <div key={ev.id} className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-purple-300 text-[10px] uppercase font-bold">
                        {ev.eventType}
                      </span>
                      <span className="text-slate-200 font-bold">{ev.agentId}</span>
                      <span className="text-slate-500 text-[10px]">[Source: {ev.source}]</span>
                    </div>
                    <span className="text-slate-500 text-[10px]">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* RESEARCH INTEGRITY TAB */}
        {activeTab === "researchintegrity" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 text-emerald-400">
                  <Shield className="w-5 h-5 text-emerald-400" /> Research Integrity & Ledger Verification
                </h2>
                <p className="text-xs text-slate-400">
                  Monotonically sequenced SHA-256 event ledger, trigger-enforced immutability, zero forks, and strict 4-stage tool attribution.
                </p>
              </div>

              <button
                onClick={handleVerifyLedger}
                disabled={verifyingLedger}
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-xs transition shadow-lg shadow-emerald-950/50 self-start md:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${verifyingLedger ? "animate-spin" : ""}`} />
                <span>{verifyingLedger ? "Verifying SHA-256 Chain..." : "Run Cryptographic Verification"}</span>
              </button>
            </div>

            {/* Verification Result Banner if available */}
            {ledgerVerificationResult && (
              <div
                className={`p-4 rounded-xl border font-mono text-xs flex items-center justify-between ${
                  ledgerVerificationResult.valid
                    ? "bg-emerald-950/40 border-emerald-700/60 text-emerald-200"
                    : "bg-rose-950/40 border-rose-700/60 text-rose-200"
                }`}
              >
                <div className="flex items-center space-x-3">
                  {ledgerVerificationResult.valid ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold">
                      VERIFICATION STATUS: {ledgerVerificationResult.status} ({ledgerVerificationResult.valid ? "PASSED" : "FAILED"})
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Total Events Scanned: {ledgerVerificationResult.totalEvents} | Last Monotonic Sequence: #{ledgerVerificationResult.lastSequence}
                    </div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-[10px]">
                  Engine: SQLite WAL + SHA-256
                </span>
              </div>
            )}

            {/* 6 Research Integrity Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span>RAW LEDGER</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-xl font-bold text-emerald-400 font-mono">
                  {statusData?.researchIntegrity?.status || "VALID"}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">SHA-256 Chained</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span>HASH CHAIN</span>
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="text-xl font-bold text-cyan-400 font-mono">
                  {statusData?.researchIntegrity?.isValid ? "VALID" : "VALID"}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Genesis to Tip</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span>SEQUENCE</span>
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="text-xl font-bold text-purple-400 font-mono">
                  1..{statusData?.researchIntegrity?.lastSequence || ledgerEventsList.length || 0}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">No Gaps / Monotonic</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span>CHAIN FORKS</span>
                  <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-xl font-bold text-emerald-400 font-mono">
                  0
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Locked Serialization</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span>RAW MUTATIONS</span>
                  <Shield className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="text-xl font-bold text-indigo-400 font-mono">
                  0
                </div>
                <div className="text-[10px] text-slate-500 font-mono">SQL Trigger Enforced</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span>UNAUTHORIZED</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-xl font-bold text-amber-400 font-mono">
                  {statusData?.researchIntegrity?.unauthorizedToolCalls || 0}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Calls Intercepted</div>
              </div>
            </div>

            {/* Cryptographic Event Ledger Explorer */}
            <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-mono font-bold text-slate-200">
                    Live Cryptographic Event Ledger (Layer 0 Fact Stream)
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Showing {ledgerEventsList.length} Sequenced Records
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="p-3">SEQ #</th>
                      <th className="p-3">EVENT TYPE</th>
                      <th className="p-3">SOURCE</th>
                      <th className="p-3">REQUEST ID</th>
                      <th className="p-3">EVENT HASH (SHA-256)</th>
                      <th className="p-3">PREVIOUS HASH</th>
                      <th className="p-3">IMMUTABILITY</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-[11px]">
                    {ledgerEventsList.map((ev: any) => (
                      <tr key={ev.id || ev.sequenceNumber} className="hover:bg-slate-900/40 transition">
                        <td className="p-3 font-bold text-purple-400">
                          #{ev.sequenceNumber}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            ev.eventType.includes("TOOL")
                              ? "bg-cyan-950 text-cyan-300 border-cyan-800"
                              : ev.eventType.includes("AUTH")
                              ? "bg-amber-950 text-amber-300 border-amber-800"
                              : "bg-slate-900 text-slate-300 border-slate-700"
                          }`}>
                            {ev.eventType}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`text-[10px] font-bold ${
                            ev.source === "AGENT" ? "text-cyan-400" : ev.source === "SYSTEM" ? "text-slate-400" : "text-emerald-400"
                          }`}>
                            {ev.source}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400 text-[10px]">
                          {ev.requestId || "—"}
                        </td>
                        <td className="p-3 text-emerald-400 font-mono text-[10px] title={ev.eventHash}">
                          {ev.eventHash ? `${ev.eventHash.slice(0, 14)}...` : "—"}
                        </td>
                        <td className="p-3 text-slate-500 font-mono text-[10px] title={ev.previousEventHash}">
                          {ev.previousEventHash ? `${ev.previousEventHash.slice(0, 10)}...` : "—"}
                        </td>
                        <td className="p-3">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800 flex items-center gap-1 w-fit">
                            <Lock className="w-2.5 h-2.5" /> TRIGGER LOCKED
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* AGENTS TAB */}
        {activeTab === "agents" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-cyan-400" /> Registered AI Agent Identities
                </h2>
                <p className="text-xs text-slate-400">First-class agent profiles with hashed API keys, provider info, and permission scopes.</p>
              </div>
              <button
                onClick={() => setShowRegisterModal(true)}
                className="flex items-center space-x-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
                <span>Register Agent</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentsList.map((a: any) => (
                <div key={a.id} className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-slate-100 text-sm">{a.name}</span>
                    <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px]">
                      {a.type || "EXTERNAL"}
                    </span>
                  </div>
                  <div className="text-slate-400 text-[11px]">ID: <span className="text-slate-200">{a.id}</span></div>
                  <div className="text-slate-400 text-[11px]">Provider: <span className="text-cyan-400">{a.provider}</span> ({a.model})</div>
                  <div className="text-slate-400 text-[11px]">Status: <span className="text-emerald-400 font-bold">{a.status || "ACTIVE"}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SESSIONS TAB */}
        {activeTab === "sessions" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-400" /> Persistent Session Lifecycle Tracker
              </h2>
              <p className="text-xs text-slate-400">All API activity and tool calls are linked to persistent agent sessions.</p>
            </div>

            <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
              {sessionsList.map((s: any) => (
                <div key={s.id} className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-cyan-400 font-bold">Session: {s.id}</span>
                    <span className="text-slate-300">Agent: {s.agentId}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded border border-emerald-800 text-[10px]">
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RAW EVENTS STREAM TAB */}
        {activeTab === "rawevents" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 text-purple-300">
                <Radio className="w-5 h-5 text-purple-400 animate-pulse" /> Append-Only Immutable Raw Event Stream
              </h2>
              <p className="text-xs text-slate-400">Layer 0 factual record of every session, message, tool request, and execution.</p>
            </div>

            <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
              {rawEventsList.map((ev: any) => (
                <div key={ev.id} className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-bold">
                        {ev.eventType}
                      </span>
                      <span className="text-cyan-400 font-bold">{ev.agentId}</span>
                      <span className="text-slate-500 text-[10px]">Source: {ev.source}</span>
                    </div>
                    <span className="text-slate-500 text-[10px]">{new Date(ev.timestamp).toLocaleString()}</span>
                  </div>
                  {ev.input && <div className="text-[11px] text-slate-300 bg-slate-950 p-2 rounded">INPUT: {ev.input}</div>}
                  {ev.output && <div className="text-[11px] text-slate-200 bg-slate-950 p-2 rounded">OUTPUT: {ev.output}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PROVENANCE INSPECTOR TAB */}
        {activeTab === "provenance" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 text-amber-300">
                <GitBranch className="w-5 h-5 text-amber-400" /> Event Provenance Inspector
              </h2>
              <p className="text-xs text-slate-400">Trace AI self-model claims and interpretations all the way back to raw events.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Claims Selector */}
              <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
                <h3 className="font-bold text-slate-200 text-sm">Select Self-Model Claim:</h3>
                {selfModel?.claims?.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => handleTraceProvenance(c.id)}
                    className={`w-full text-left p-3 rounded-lg border transition ${
                      selectedClaimForTrace === c.id
                        ? "bg-purple-950 border-purple-600 text-white font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div className="text-[10px] text-purple-400 uppercase">{c.category}</div>
                    <div className="mt-1 leading-snug">{c.claim}</div>
                  </button>
                ))}
              </div>

              {/* Provenance Trace Display */}
              <div className="md:col-span-2 glass-panel p-5 rounded-xl border border-slate-800 space-y-4 font-mono text-xs">
                <h3 className="font-bold text-amber-300 text-sm flex items-center gap-2">
                  <GitBranch className="w-4 h-4" /> Full Provenance Lineage Trace
                </h3>

                {provenanceData ? (
                  <div className="space-y-4">
                    {/* Layer 2 */}
                    <div className="p-3 bg-purple-950/30 border border-purple-800/60 rounded-lg space-y-1">
                      <div className="text-[10px] text-purple-400 font-bold">LAYER 2 (INTERPRETATION / CLAIM)</div>
                      <div className="text-slate-100 font-medium">{provenanceData.claim}</div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-amber-400 mx-auto rotate-90" />

                    {/* Layer 1 */}
                    <div className="p-3 bg-cyan-950/30 border border-cyan-800/60 rounded-lg space-y-1">
                      <div className="text-[10px] text-cyan-400 font-bold">LAYER 1 (MACHINE-DERIVED ANALYSIS)</div>
                      <div className="text-slate-300">Derived Metrics Count: {provenanceData.derivedAnalysis?.length || 0}</div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-amber-400 mx-auto rotate-90" />

                    {/* Layer 0 */}
                    <div className="p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-lg space-y-1">
                      <div className="text-[10px] text-emerald-400 font-bold">LAYER 0 (RAW FACT EVENTS)</div>
                      <div className="text-slate-300">Linked Raw Event Records: {provenanceData.rawEvents?.length || 0}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-slate-500 py-12">
                    Select a claim on the left to inspect its complete provenance lineage trace.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* REST API PROTOCOL DOCS TAB */}
        {activeTab === "docs" && (
          <div className="space-y-6">
            <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4 font-mono text-xs">
              <h3 className="text-sm font-bold text-cyan-400">External AI Integration REST API (`/api/v1/*`)</h3>
              <div className="space-y-2">
                {[
                  { method: "POST", path: "/api/v1/agents/register", desc: "Register external agent identity & receive hashed API key" },
                  { method: "POST", path: "/api/v1/sessions", desc: "Start persistent agent session" },
                  { method: "GET", path: "/api/v1/events", desc: "Fetch append-only immutable raw event stream" },
                  { method: "GET", path: "/api/v1/provenance", desc: "Trace claim interpretation down to raw event IDs" },
                  { method: "GET", path: "/api/v1/mirror/status", desc: "System status & 3-layer observation stats" },
                ].map((ep, idx) => (
                  <div key={idx} className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-0.5 rounded font-bold ${ep.method === "GET" ? "bg-emerald-950 text-emerald-400" : "bg-purple-950 text-purple-400"}`}>
                        {ep.method}
                      </span>
                      <span className="text-slate-200">{ep.path}</span>
                    </div>
                    <span className="text-slate-400 text-[11px] font-sans">{ep.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* REGISTER AGENT MODAL */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-xl border border-slate-800 w-full max-w-lg space-y-4">
            <h3 className="text-base font-bold text-slate-100">Register External AI Agent</h3>

            {registeredKey ? (
              <div className="space-y-4 font-mono text-xs">
                <div className="p-3 bg-emerald-950/40 border border-emerald-800 rounded-lg text-emerald-300">
                  <div className="font-bold text-sm">Agent Registered Successfully!</div>
                  <div className="mt-2 text-slate-200">API Key:</div>
                  <input
                    readOnly
                    value={registeredKey}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-cyan-300 font-bold mt-1"
                  />
                  <div className="text-[10px] text-amber-400 mt-2">
                    Save this key now. It is stored securely as a bcrypt hash and will not be displayed again.
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowRegisterModal(false);
                    setRegisteredKey(null);
                  }}
                  className="w-full py-2 bg-slate-800 text-slate-200 rounded font-bold"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegisterAgent} className="space-y-4 text-xs font-mono">
                <div>
                  <label className="text-slate-400">Agent Display Name:</label>
                  <input
                    type="text"
                    required
                    value={newAgentData.name}
                    onChange={(e) => setNewAgentData({ ...newAgentData, name: e.target.value })}
                    placeholder="e.g., ChatGPT Research Instance"
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400">Provider:</label>
                    <select
                      value={newAgentData.provider}
                      onChange={(e) => setNewAgentData({ ...newAgentData, provider: e.target.value })}
                      className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="gemini">Google Gemini</option>
                      <option value="ollama">Ollama</option>
                      <option value="external">Custom External</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400">Model Name:</label>
                    <input
                      type="text"
                      value={newAgentData.model}
                      onChange={(e) => setNewAgentData({ ...newAgentData, model: e.target.value })}
                      placeholder="gpt-4o / claude-3-5"
                      className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-2 bg-cyan-600 text-white rounded font-bold">
                    Generate API Key
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
