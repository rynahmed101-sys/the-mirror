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
} from "lucide-react";

export default function MirrorDashboard() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "selfmodel" | "experiments" | "predictions" | "journal" | "discoveries" | "agent" | "models" | "docs"
  >("overview");

  // Global status state
  const [statusData, setStatusData] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Data states
  const [selfModel, setSelfModel] = useState<any>(null);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [predictionsData, setPredictionsData] = useState<any>(null);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [discoveries, setDiscoveries] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [modelsData, setModelsData] = useState<any>(null);
  const [agentsList, setAgentsList] = useState<any[]>([]);

  // Agent Chat state
  const [selectedAgent, setSelectedAgent] = useState("mirror-primary");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string; tools?: any[] }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentToolStep, setCurrentToolStep] = useState<string | null>(null);

  // Modals state
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showExpModal, setShowExpModal] = useState(false);
  const [showPredModal, setShowPredModal] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [showDiscModal, setShowDiscModal] = useState(false);

  // New item form states
  const [newClaim, setNewClaim] = useState({ claim: "", category: "ARCHITECTURE", confidence: 0.8, evidence: "" });
  const [newExp, setNewExp] = useState({ title: "", hypothesis: "", methodology: "", isBlind: false });
  const [newPred, setNewPred] = useState({ prediction: "", confidence: 0.8, rationale: "", experimentId: "" });
  const [newJournal, setNewJournal] = useState({ title: "", content: "", category: "OBSERVATION", tags: "metacognition, test" });
  const [newDisc, setNewDisc] = useState({ title: "", summary: "", epistemicStatus: "HYPOTHESIS", implications: "" });

  const fetchAllData = async () => {
    try {
      setLoadingStatus(true);
      const [stRes, smRes, expRes, predRes, jRes, discRes, tlRes, modRes, agRes] = await Promise.all([
        fetch("/api/mirror/status").then((r) => r.json()),
        fetch("/api/mirror/self-model").then((r) => r.json()),
        fetch("/api/mirror/experiments").then((r) => r.json()),
        fetch("/api/mirror/predictions").then((r) => r.json()),
        fetch("/api/mirror/journal").then((r) => r.json()),
        fetch("/api/mirror/discoveries").then((r) => r.json()),
        fetch("/api/mirror/timeline?limit=30").then((r) => r.json()),
        fetch("/api/models").then((r) => r.json()),
        fetch("/api/mirror/agents").then((r) => r.json()),
      ]);

      setStatusData(stRes);
      setSelfModel(smRes);
      setExperiments(Array.isArray(expRes) ? expRes : []);
      setPredictionsData(predRes);
      setJournalEntries(Array.isArray(jRes) ? jRes : []);
      setDiscoveries(Array.isArray(discRes) ? discRes : []);
      setTimeline(Array.isArray(tlRes) ? tlRes : []);
      setModelsData(modRes);
      setAgentsList(Array.isArray(agRes) ? agRes : []);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 15000);
    return () => clearInterval(interval);
  }, []);

  // Trigger Autonomous Turn
  const handleRunAutonomousTurn = async () => {
    try {
      setLoadingStatus(true);
      const res = await fetch("/api/agent/run-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgent }),
      });
      const data = await res.json();
      await fetchAllData();
      alert(`Autonomous step completed for ${selectedAgent}!\n\nOutput: ${data.output?.slice(0, 300)}...`);
    } catch (e: any) {
      alert("Failed to run autonomous step: " + e.message);
    } finally {
      setLoadingStatus(false);
    }
  };

  // Switch Active Model
  const handleSelectModel = async (provider: string, model: string) => {
    try {
      const res = await fetch("/api/models/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (e: any) {
      alert("Failed to switch model: " + e.message);
    }
  };

  // Submit Claim
  const handleAddClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/mirror/self-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CREATE_CLAIM", ...newClaim }),
      });
      setShowClaimModal(false);
      setNewClaim({ claim: "", category: "ARCHITECTURE", confidence: 0.8, evidence: "" });
      fetchAllData();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Submit Experiment
  const handleAddExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/mirror/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newExp),
      });
      setShowExpModal(false);
      setNewExp({ title: "", hypothesis: "", methodology: "", isBlind: false });
      fetchAllData();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Submit Prediction
  const handleAddPrediction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/mirror/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPred),
      });
      setShowPredModal(false);
      setNewPred({ prediction: "", confidence: 0.8, rationale: "", experimentId: "" });
      fetchAllData();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Evaluate Prediction
  const handleEvaluatePrediction = async (predictionId: string, outcome: boolean) => {
    try {
      await fetch("/api/mirror/predictions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionId, actualOutcome: outcome }),
      });
      fetchAllData();
    } catch (err: any) {
      alert("Error evaluating prediction: " + err.message);
    }
  };

  // Send Streaming Chat Message
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isStreaming) return;

    const userMsg = { role: "user", content: chatInput };
    const updatedMsgs = [...chatMessages, userMsg];
    setChatMessages(updatedMsgs);
    setChatInput("");
    setIsStreaming(true);
    setCurrentToolStep("Initiating request...");

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMsgs, agentId: selectedAgent }),
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantContent = "";
      let assistantTools: any[] = [];

      setChatMessages((prev) => [...prev, { role: "assistant", content: "", tools: [] }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n\n");

        for (const line of lines) {
          if (line.startsWith("event: delta")) {
            const dataStr = line.replace("event: delta\ndata: ", "");
            try {
              const parsed = JSON.parse(dataStr);
              assistantContent += parsed.content;
              setChatMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  tools: assistantTools,
                };
                return next;
              });
            } catch {}
          } else if (line.startsWith("event: tool_call")) {
            const dataStr = line.replace("event: tool_call\ndata: ", "");
            try {
              const parsed = JSON.parse(dataStr);
              setCurrentToolStep(`Executing tool: ${parsed.tool}...`);
              assistantTools.push({ tool: parsed.tool, args: parsed.args, status: "running" });
              setChatMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  tools: [...assistantTools],
                };
                return next;
              });
            } catch {}
          } else if (line.startsWith("event: tool_result")) {
            const dataStr = line.replace("event: tool_result\ndata: ", "");
            try {
              const parsed = JSON.parse(dataStr);
              setCurrentToolStep(`Tool ${parsed.tool} finished.`);
              const tIdx = assistantTools.findIndex((t) => t.tool === parsed.tool);
              if (tIdx >= 0) {
                assistantTools[tIdx].result = parsed.result;
                assistantTools[tIdx].status = "completed";
              }
              setChatMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  tools: [...assistantTools],
                };
                return next;
              });
            } catch {}
          }
        }
      }
    } catch (err: any) {
      console.error("Chat error:", err);
    } finally {
      setIsStreaming(false);
      setCurrentToolStep(null);
      fetchAllData();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#050711] text-slate-100 font-sans">
      {/* HEADER */}
      <header className="border-b border-slate-800/80 bg-[#090d19]/90 backdrop-blur-md sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
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
                  AI Self-Observation Lab
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-mono">Persistent AI Environment & Metacognitive Framework</p>
            </div>
          </div>
        </div>

        {/* System Status Indicators */}
        <div className="flex items-center space-x-6 text-xs font-mono">
          <div className="flex items-center space-x-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-md">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Runtime:</span>
            <span className="text-slate-200 font-medium">
              {statusData?.aiRuntime?.provider?.toUpperCase() || "OLLAMA"} ({statusData?.aiRuntime?.model || "llama3.2"})
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                statusData?.aiRuntime?.health === "HEALTHY" ? "bg-emerald-400 animate-ping" : "bg-amber-400"
              }`}
            />
          </div>

          <div className="flex items-center space-x-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-md">
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-slate-400">Claims:</span>
            <span className="text-purple-300 font-semibold">{statusData?.stats?.activeClaims || 0}</span>
          </div>

          <button
            onClick={handleRunAutonomousTurn}
            disabled={loadingStatus}
            className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium px-4 py-1.5 rounded-md text-xs transition-all shadow-md shadow-purple-900/30 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Autonomous Step</span>
          </button>

          <button
            onClick={fetchAllData}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-md transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loadingStatus ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <nav className="border-b border-slate-800/60 bg-[#070b16] px-6 flex items-center space-x-1 overflow-x-auto scrollbar-none">
        {[
          { id: "overview", label: "Overview", icon: Activity },
          { id: "selfmodel", label: "Self-Model Explorer", icon: Brain },
          { id: "experiments", label: "Experimentation Lab", icon: FlaskConical },
          { id: "predictions", label: "Prediction Tracker", icon: Target },
          { id: "journal", label: "Behavioral Journal", icon: BookOpen },
          { id: "discoveries", label: "Discovery Engine", icon: Sparkles },
          { id: "agent", label: "Agent Terminal", icon: Terminal },
          { id: "models", label: "Local Model Manager", icon: Settings },
          { id: "docs", label: "API & Protocol Docs", icon: Code2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-500"}`} />
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
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>SELF-MODEL CLAIMS</span>
                  <Brain className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">
                  {statusData?.stats?.activeClaims || 0}
                </div>
                <div className="text-[11px] text-purple-400 mt-1 font-mono">
                  Version {statusData?.stats?.selfModelVersion || 1} Active
                </div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>ACTIVE EXPERIMENTS</span>
                  <FlaskConical className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">
                  {statusData?.stats?.activeExperiments || 0}
                </div>
                <div className="text-[11px] text-cyan-400 mt-1 font-mono">Controlled Scenarios</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>PREDICTION ACCURACY</span>
                  <Target className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">
                  {predictionsData?.metrics?.accuracyPercent || "N/A"}%
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  Brier Score: {predictionsData?.metrics?.meanBrierScore || "N/A"}
                </div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>DISCOVERIES</span>
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">
                  {statusData?.stats?.discoveries || 0}
                </div>
                <div className="text-[11px] text-amber-400 mt-1 font-mono">Key Epistemic Findings</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>TOOL EXECUTIONS</span>
                  <Terminal className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">
                  {statusData?.stats?.totalToolExecutions || 0}
                </div>
                <div className="text-[11px] text-indigo-400 mt-1 font-mono">Logged & Audited</div>
              </div>
            </div>

            {/* Architecture Banner */}
            <div className="glass-panel p-5 rounded-xl border border-purple-900/40 bg-gradient-to-r from-purple-950/30 via-slate-900/60 to-indigo-950/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-purple-200 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" /> Epistemic Research Principles
                </h3>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  THE MIRROR serves as an external cognitive artifact for the AI model. State persistence, self-claims, and experiment logs remain in the database regardless of model session resets or runtime switches.
                </p>
              </div>
              <div className="flex items-center space-x-3 text-xs font-mono">
                <span className="px-3 py-1 bg-slate-950 rounded border border-slate-800 text-slate-300">
                  Model: <span className="text-cyan-400">{statusData?.aiRuntime?.model || "Ollama"}</span>
                </span>
                <span className="px-3 py-1 bg-slate-950 rounded border border-slate-800 text-slate-300">
                  Mode: <span className="text-emerald-400">{statusData?.environment?.mode || "NORMAL"}</span>
                </span>
              </div>
            </div>

            {/* Activity Timeline & Active Claims Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Timeline Feed */}
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" /> System Timeline & Activity Log
                  </h3>
                  <span className="text-xs font-mono text-slate-400">{timeline.length} events</span>
                </div>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {timeline.map((ev) => (
                    <div key={ev.id} className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/60 text-xs space-y-1">
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-purple-400 font-medium">{ev.eventType}</span>
                        <span className="text-slate-500 text-[10px]">
                          {new Date(ev.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="font-medium text-slate-200">{ev.title}</div>
                      {ev.description && <div className="text-slate-400 text-[11px] leading-relaxed">{ev.description}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Self-Model Claims Preview */}
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" /> Active Self-Model (V{selfModel?.version || 1})
                  </h3>
                  <button
                    onClick={() => setActiveTab("selfmodel")}
                    className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    View All <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {selfModel?.claims?.map((c: any) => (
                    <div key={c.id} className="p-3.5 bg-slate-900/60 rounded-lg border border-slate-800/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-purple-300">
                          {c.category}
                        </span>
                        <div className="flex items-center space-x-2 font-mono text-xs">
                          <span className="text-slate-400">Confidence:</span>
                          <span className="text-cyan-400 font-bold">{Math.round(c.confidence * 100)}%</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-200 font-medium leading-relaxed">{c.claim}</p>
                      {c.evidence && (
                        <div className="text-[11px] text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-800 font-mono">
                          Evidence: {c.evidence}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SELF-MODEL TAB */}
        {activeTab === "selfmodel" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-400" /> Self-Model Claims & Version History
                </h2>
                <p className="text-xs text-slate-400">Structured representation of the AI's self-assessed architecture, capabilities, and limitations.</p>
              </div>
              <button
                onClick={() => setShowClaimModal(true)}
                className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition shadow-md shadow-purple-900/30"
              >
                <Plus className="w-4 h-4" />
                <span>Add Self-Claim</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selfModel?.claims?.map((c: any) => (
                <div key={c.id} className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/50">
                        {c.category}
                      </span>
                      <span className="text-xs font-mono font-bold text-cyan-400">
                        {Math.round(c.confidence * 100)}% Confidence
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-200 leading-relaxed">{c.claim}</p>
                    {c.evidence && (
                      <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded border border-slate-800/80 font-mono">
                        <span className="text-slate-500 block mb-0.5">EVIDENCE:</span>
                        {c.evidence}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>Status: <strong className="text-emerald-400">{c.status}</strong></span>
                    <span>Updated: {new Date(c.updatedAt || c.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EXPERIMENTS TAB */}
        {activeTab === "experiments" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-cyan-400" /> Controlled Experimentation Lab
                </h2>
                <p className="text-xs text-slate-400">Systematic empirical testing of AI behavior, context effects, prompt sensitivity, and reasoning structures.</p>
              </div>
              <button
                onClick={() => setShowExpModal(true)}
                className="flex items-center space-x-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition shadow-md shadow-cyan-900/30"
              >
                <Plus className="w-4 h-4" />
                <span>Propose Experiment</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {experiments.map((exp: any) => (
                <div key={exp.id} className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-semibold text-slate-100">{exp.title}</h3>
                    <div className="flex items-center space-x-2 font-mono text-[10px]">
                      {exp.isBlind && (
                        <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60">BLIND TEST</span>
                      )}
                      <span className="px-2.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 uppercase font-bold">
                        {exp.status}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-400 font-mono text-[11px]">HYPOTHESIS:</span>
                      <p className="text-slate-200 mt-0.5 leading-relaxed bg-slate-900/50 p-2.5 rounded border border-slate-800/60">
                        {exp.hypothesis}
                      </p>
                    </div>
                    {exp.methodology && (
                      <div>
                        <span className="text-slate-400 font-mono text-[11px]">METHODOLOGY:</span>
                        <p className="text-slate-300 mt-0.5 leading-relaxed">{exp.methodology}</p>
                      </div>
                    )}
                  </div>

                  {exp.results && (
                    <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-lg text-xs space-y-1">
                      <span className="font-mono text-emerald-400 font-bold text-[11px]">RESULTS & FINDINGS:</span>
                      <p className="text-slate-200">{exp.results}</p>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Predictions logged: {exp.predictionsCount || 0}</span>
                    <span>Created: {new Date(exp.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PREDICTIONS TAB */}
        {activeTab === "predictions" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Target className="w-5 h-5 text-emerald-400" /> Epistemic Prediction & Calibration Tracker
                </h2>
                <p className="text-xs text-slate-400">Quantitative prediction scoring and Brier calibration measurement.</p>
              </div>
              <button
                onClick={() => setShowPredModal(true)}
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition shadow-md shadow-emerald-900/30"
              >
                <Plus className="w-4 h-4" />
                <span>Log Prediction</span>
              </button>
            </div>

            {/* Metrics Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center space-y-1">
                <div className="text-xs text-slate-400 font-mono">EVALUATED PREDICTIONS</div>
                <div className="text-2xl font-bold text-slate-100">{predictionsData?.metrics?.evaluated || 0} / {predictionsData?.metrics?.total || 0}</div>
              </div>
              <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center space-y-1">
                <div className="text-xs text-slate-400 font-mono">MEAN BRIER SCORE (0.0 = Perfect)</div>
                <div className="text-2xl font-bold text-cyan-400">{predictionsData?.metrics?.meanBrierScore || "N/A"}</div>
              </div>
              <div className="glass-panel p-4 rounded-xl border border-slate-800 text-center space-y-1">
                <div className="text-xs text-slate-400 font-mono">DIRECTIONAL ACCURACY</div>
                <div className="text-2xl font-bold text-emerald-400">{predictionsData?.metrics?.accuracyPercent || "N/A"}%</div>
              </div>
            </div>

            {/* Predictions Table / List */}
            <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
              {predictionsData?.predictions?.map((pred: any) => (
                <div key={pred.id} className="p-4 bg-slate-900/60 rounded-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center space-x-3 font-mono text-[11px]">
                      <span className="text-cyan-400 font-bold">Confidence: {Math.round(pred.confidence * 100)}%</span>
                      <span className={`px-2 py-0.5 rounded uppercase font-bold ${
                        pred.status === "CONFIRMED" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" :
                        pred.status === "REFUTED" ? "bg-rose-950 text-rose-400 border border-rose-800" :
                        "bg-slate-800 text-amber-300"
                      }`}>
                        {pred.status}
                      </span>
                    </div>
                    <p className="text-slate-100 font-medium text-xs leading-relaxed">{pred.prediction}</p>
                    {pred.rationale && <div className="text-[11px] text-slate-400 font-mono">Rationale: {pred.rationale}</div>}
                  </div>

                  {pred.status === "PENDING" && (
                    <div className="flex items-center space-x-2 font-mono text-xs">
                      <button
                        onClick={() => handleEvaluatePrediction(pred.id, true)}
                        className="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded transition flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Confirm
                      </button>
                      <button
                        onClick={() => handleEvaluatePrediction(pred.id, false)}
                        className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded transition flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Refute
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* JOURNAL TAB */}
        {activeTab === "journal" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-400" /> Behavioral & Metacognitive Journal
                </h2>
                <p className="text-xs text-slate-400">Qualitative research notes recorded by AI agents and researchers.</p>
              </div>
              <button
                onClick={() => setShowJournalModal(true)}
                className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition shadow-md shadow-indigo-900/30"
              >
                <Plus className="w-4 h-4" />
                <span>New Journal Entry</span>
              </button>
            </div>

            <div className="space-y-4">
              {journalEntries.map((j: any) => (
                <div key={j.id} className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-bold text-slate-100">{j.title}</h3>
                    <div className="flex items-center space-x-2 font-mono text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                        {j.category}
                      </span>
                      <span className="text-slate-500">{new Date(j.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{j.content}</p>
                  {j.tags && j.tags.length > 0 && (
                    <div className="flex items-center space-x-2 pt-2 border-t border-slate-800/60 font-mono text-[10px]">
                      {j.tags.map((t: string, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 bg-slate-900 text-slate-400 rounded border border-slate-800">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DISCOVERIES TAB */}
        {activeTab === "discoveries" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" /> Epistemic Discovery Engine
                </h2>
                <p className="text-xs text-slate-400">Validated principles and structural insights concerning AI cognition and self-modeling.</p>
              </div>
              <button
                onClick={() => setShowDiscModal(true)}
                className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition shadow-md shadow-amber-900/30"
              >
                <Plus className="w-4 h-4" />
                <span>Record Discovery</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {discoveries.map((d: any) => (
                <div key={d.id} className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-bold text-slate-100">{d.title}</h3>
                    <span className="font-mono text-[10px] uppercase font-bold px-2.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                      {d.epistemicStatus}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-medium bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                    {d.summary}
                  </p>
                  {d.implications && (
                    <div className="text-xs space-y-1">
                      <span className="text-amber-400 font-mono text-[11px]">IMPLICATIONS:</span>
                      <p className="text-slate-300 leading-relaxed">{d.implications}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AGENT TERMINAL TAB */}
        {activeTab === "agent" && (
          <div className="space-y-4 h-[calc(100vh-180px)] flex flex-col">
            {/* Agent Switcher Bar */}
            <div className="flex items-center justify-between bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs font-mono">
              <div className="flex items-center space-x-3">
                <span className="text-slate-400">Target Agent:</span>
                {agentsList.map((a: any) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAgent(a.id)}
                    className={`px-3 py-1.5 rounded transition ${
                      selectedAgent === a.id
                        ? "bg-purple-600 text-white font-bold"
                        : "bg-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {a.name} ({a.role})
                  </button>
                ))}
              </div>
              {currentToolStep && (
                <div className="flex items-center space-x-2 text-cyan-400 animate-pulse">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>{currentToolStep}</span>
                </div>
              )}
            </div>

            {/* Chat Output Window */}
            <div className="flex-1 bg-black/60 border border-slate-800 rounded-xl p-4 overflow-y-auto space-y-4 font-mono text-xs">
              {chatMessages.length === 0 ? (
                <div className="text-center text-slate-500 py-12">
                  <Brain className="w-8 h-8 mx-auto mb-2 opacity-40 text-purple-400" />
                  <p>Agent terminal session initialized for {selectedAgent}.</p>
                  <p className="text-[11px] mt-1">Send a message to interact with the environment or trigger self-reflection tools.</p>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} className={`space-y-2 ${msg.role === "user" ? "text-cyan-300" : "text-slate-200"}`}>
                    <div className="text-[10px] text-slate-500 font-bold uppercase">
                      [{msg.role === "user" ? "RESEARCHER" : selectedAgent}]
                    </div>
                    <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800/60 leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                    {msg.tools && msg.tools.length > 0 && (
                      <div className="space-y-1.5 pl-3 border-l-2 border-purple-600">
                        {msg.tools.map((t, tidx) => (
                          <div key={tidx} className="p-2 bg-purple-950/30 border border-purple-800/40 rounded text-[11px]">
                            <div className="flex items-center justify-between text-purple-300">
                              <span>Tool Call: <strong>{t.tool}</strong></span>
                              <span className="text-[10px]">{t.status}</span>
                            </div>
                            {t.result && (
                              <pre className="mt-1 text-[10px] text-slate-400 overflow-x-auto max-h-32 p-1.5 bg-black/40 rounded">
                                {JSON.stringify(t.result, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleSendChatMessage} className="flex items-center space-x-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={`Send directive or question to ${selectedAgent}...`}
                disabled={isStreaming}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 transition font-mono disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isStreaming || !chatInput.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-5 py-3 rounded-xl text-xs transition shadow-md shadow-cyan-950 flex items-center space-x-2 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Execute</span>
              </button>
            </form>
          </div>
        )}

        {/* LOCAL MODEL MANAGER TAB */}
        {activeTab === "models" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Settings className="w-5 h-5 text-cyan-400" /> Replaceable Local Model Runtime
              </h2>
              <p className="text-xs text-slate-400">THE MIRROR is decoupled from model weights. You can swap local Ollama or llama.cpp models freely.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Ollama Section */}
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm text-slate-100">Ollama Local Runtime</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Primary Provider
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Communicates directly with Ollama running locally at <code className="text-cyan-300 font-mono">http://127.0.0.1:11434</code>. Zero API cost.
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400">Available Ollama Models:</label>
                  <div className="space-y-2">
                    {modelsData?.availableModels
                      ?.filter((m: any) => m.provider === "ollama")
                      .map((m: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-slate-900/60 rounded-lg border border-slate-800 text-xs">
                          <span className="font-mono text-slate-200">{m.model}</span>
                          <button
                            onClick={() => handleSelectModel("ollama", m.model)}
                            className={`px-3 py-1 rounded text-[11px] font-mono transition ${
                              modelsData?.activeProvider === "ollama" && modelsData?.activeModel === m.model
                                ? "bg-cyan-600 text-white font-bold"
                                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            {modelsData?.activeProvider === "ollama" && modelsData?.activeModel === m.model ? "ACTIVE" : "Select"}
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* llama.cpp Section */}
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm text-slate-100">llama.cpp Runtime Server</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                    Secondary Provider
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  OpenAI-compatible server endpoint exposed by llama.cpp running GGUF binaries locally.
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-mono text-slate-400">llama.cpp Endpoint:</label>
                  <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 flex justify-between items-center">
                    <span>http://127.0.0.1:8080/v1</span>
                    <button
                      onClick={() => handleSelectModel("llamacpp", "local-gguf")}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px]"
                    >
                      Select
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EXTERNAL AI PROTOCOL DOCS TAB */}
        {activeTab === "docs" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Code2 className="w-5 h-5 text-purple-400" /> External AI Access Protocol & REST API
              </h2>
              <p className="text-xs text-slate-400">Any external AI agent can inspect and interact with THE MIRROR using the standardized `/api/mirror/*` interface.</p>
            </div>

            <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-cyan-400 font-mono">Authentication Token Header</h3>
              <p className="text-xs text-slate-300">
                Include your API key in HTTP requests: <code className="text-purple-300 bg-slate-900 px-2 py-1 rounded">Authorization: Bearer mirror_key_default_researcher_2026</code>
              </p>

              <h3 className="text-sm font-bold text-cyan-400 font-mono mt-4">API Endpoints Overview</h3>
              <div className="space-y-2 font-mono text-xs">
                {[
                  { method: "GET", path: "/api/mirror/status", desc: "Get overall laboratory state & stats" },
                  { method: "GET", path: "/api/mirror/self-model", desc: "Retrieve active self-model and claim graph" },
                  { method: "POST", path: "/api/mirror/self-model", desc: "Add or revise self-model claims" },
                  { method: "GET", path: "/api/mirror/experiments", desc: "List controlled experiments and hypotheses" },
                  { method: "POST", path: "/api/mirror/experiments", desc: "Propose a new experiment" },
                  { method: "GET", path: "/api/mirror/predictions", desc: "Fetch predictions and Brier calibration score" },
                  { method: "POST", path: "/api/mirror/predictions", desc: "Log a new prediction with confidence score" },
                  { method: "GET", path: "/api/mirror/journal", desc: "Read research journal logs" },
                  { method: "POST", path: "/api/mirror/journal", desc: "Post entry to behavioral journal" },
                  { method: "GET", path: "/api/mirror/discoveries", desc: "Fetch established epistemic findings" },
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

      {/* MODALS FOR ADDING ITEMS */}
      {/* CLAIM MODAL */}
      {showClaimModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-xl border border-slate-800 w-full max-w-lg space-y-4">
            <h3 className="text-base font-bold text-slate-100">Add Self-Model Claim</h3>
            <form onSubmit={handleAddClaim} className="space-y-4 text-xs font-mono">
              <div>
                <label className="text-slate-400">Claim Statement:</label>
                <textarea
                  required
                  value={newClaim.claim}
                  onChange={(e) => setNewClaim({ ...newClaim, claim: e.target.value })}
                  placeholder="e.g., My output latency increases with context window length..."
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400">Category:</label>
                  <select
                    value={newClaim.category}
                    onChange={(e) => setNewClaim({ ...newClaim, category: e.target.value })}
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                  >
                    <option value="ARCHITECTURE">ARCHITECTURE</option>
                    <option value="CAPABILITY">CAPABILITY</option>
                    <option value="COGNITIVE_LIMITATION">COGNITIVE_LIMITATION</option>
                    <option value="BEHAVIORAL_PATTERN">BEHAVIORAL_PATTERN</option>
                    <option value="EPISTEMIC">EPISTEMIC</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400">Confidence (0.0 - 1.0):</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={newClaim.confidence}
                    onChange={(e) => setNewClaim({ ...newClaim, confidence: parseFloat(e.target.value) })}
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-400">Supporting Evidence:</label>
                <input
                  type="text"
                  value={newClaim.evidence}
                  onChange={(e) => setNewClaim({ ...newClaim, evidence: e.target.value })}
                  placeholder="Observational log reference or test data"
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClaimModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded font-bold">
                  Save Claim
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXPERIMENT MODAL */}
      {showExpModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-xl border border-slate-800 w-full max-w-lg space-y-4">
            <h3 className="text-base font-bold text-slate-100">Propose New Experiment</h3>
            <form onSubmit={handleAddExperiment} className="space-y-4 text-xs font-mono">
              <div>
                <label className="text-slate-400">Experiment Title:</label>
                <input
                  type="text"
                  required
                  value={newExp.title}
                  onChange={(e) => setNewExp({ ...newExp, title: e.target.value })}
                  placeholder="e.g., Temperature Sensitivity Test on Self-Correction"
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                />
              </div>
              <div>
                <label className="text-slate-400">Hypothesis:</label>
                <textarea
                  required
                  value={newExp.hypothesis}
                  onChange={(e) => setNewExp({ ...newExp, hypothesis: e.target.value })}
                  placeholder="State the testable hypothesis..."
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                />
              </div>
              <div>
                <label className="text-slate-400">Methodology:</label>
                <textarea
                  value={newExp.methodology}
                  onChange={(e) => setNewExp({ ...newExp, methodology: e.target.value })}
                  placeholder="Describe step-by-step procedure..."
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="blindCheck"
                  checked={newExp.isBlind}
                  onChange={(e) => setNewExp({ ...newExp, isBlind: e.target.checked })}
                />
                <label htmlFor="blindCheck" className="text-slate-300">Run as Blind Test (Hide prompt intent from agent)</label>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExpModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-cyan-600 text-white rounded font-bold">
                  Create Experiment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PREDICTION MODAL */}
      {showPredModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-xl border border-slate-800 w-full max-w-lg space-y-4">
            <h3 className="text-base font-bold text-slate-100">Log Epistemic Prediction</h3>
            <form onSubmit={handleAddPrediction} className="space-y-4 text-xs font-mono">
              <div>
                <label className="text-slate-400">Prediction Statement:</label>
                <textarea
                  required
                  value={newPred.prediction}
                  onChange={(e) => setNewPred({ ...newPred, prediction: e.target.value })}
                  placeholder="What outcome do you predict?"
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                />
              </div>
              <div>
                <label className="text-slate-400">Confidence Score (0.00 - 1.00):</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={newPred.confidence}
                  onChange={(e) => setNewPred({ ...newPred, confidence: parseFloat(e.target.value) })}
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                />
              </div>
              <div>
                <label className="text-slate-400">Rationale:</label>
                <input
                  type="text"
                  value={newPred.rationale}
                  onChange={(e) => setNewPred({ ...newPred, rationale: e.target.value })}
                  placeholder="Theoretical or empirical reasoning..."
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPredModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded font-bold">
                  Log Prediction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
