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
} from "lucide-react";

export default function MirrorDashboard() {
  const [activeTab, setActiveTab] = useState<
    | "overview"
    | "whatchanged"
    | "unexpected"
    | "openquestions"
    | "layers"
    | "selfmodel"
    | "experiments"
    | "predictions"
    | "journal"
    | "discoveries"
    | "agent"
    | "models"
    | "docs"
  >("overview");

  // Global status state
  const [statusData, setStatusData] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Stage 2 Data states
  const [selfModel, setSelfModel] = useState<any>(null);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [predictionsData, setPredictionsData] = useState<any>(null);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [discoveries, setDiscoveries] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [modelsData, setModelsData] = useState<any>(null);
  const [agentsList, setAgentsList] = useState<any[]>([]);
  const [baselines, setBaselines] = useState<any[]>([]);
  const [anomaliesList, setAnomaliesList] = useState<any[]>([]);
  const [openQuestionsList, setOpenQuestionsList] = useState<any[]>([]);
  const [rawObservationsList, setRawObservationsList] = useState<any[]>([]);

  // Agent Chat & Researcher Override state
  const [selectedAgent, setSelectedAgent] = useState("mirror-primary");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string; tools?: any[] }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentToolStep, setCurrentToolStep] = useState<string | null>(null);
  const [isSelfModelFrozen, setIsSelfModelFrozen] = useState(false);
  const [isMemoryLocked, setIsMemoryLocked] = useState(false);

  // Modals state
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showExpModal, setShowExpModal] = useState(false);
  const [showPredModal, setShowPredModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);

  // New item form states
  const [newClaim, setNewClaim] = useState({ claim: "", category: "ARCHITECTURE", confidence: 0.8, evidence: "" });
  const [newExp, setNewExp] = useState({ title: "", hypothesis: "", methodology: "", isBlind: false });
  const [newPred, setNewPred] = useState({ prediction: "", confidence: 0.8, rationale: "", predictionType: "BEHAVIOR" });
  const [newQuestion, setNewQuestion] = useState({ question: "", category: "METACOGNITION" });

  const fetchAllData = async () => {
    try {
      setLoadingStatus(true);
      const [stRes, smRes, expRes, predRes, jRes, discRes, tlRes, modRes, agRes, baseRes, anomRes, openQRes, rawObsRes] = await Promise.all([
        fetch("/api/v1/mirror/status").then((r) => r.json()),
        fetch("/api/v1/self-model").then((r) => r.json()),
        fetch("/api/v1/experiments").then((r) => r.json()),
        fetch("/api/v1/predictions").then((r) => r.json()),
        fetch("/api/mirror/journal").then((r) => r.json()),
        fetch("/api/v1/discoveries").then((r) => r.json()),
        fetch("/api/v1/timeline?limit=30").then((r) => r.json()),
        fetch("/api/models").then((r) => r.json()),
        fetch("/api/v1/agents").then((r) => r.json()),
        fetch("/api/v1/baselines").then((r) => r.json()),
        fetch("/api/v1/anomalies").then((r) => r.json()),
        fetch("/api/v1/open-questions").then((r) => r.json()),
        fetch("/api/v1/observations?limit=40").then((r) => r.json()),
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
      setBaselines(Array.isArray(baseRes) ? baseRes : []);
      setAnomaliesList(Array.isArray(anomRes) ? anomRes : []);
      setOpenQuestionsList(Array.isArray(openQRes) ? openQRes : []);
      setRawObservationsList(Array.isArray(rawObsRes) ? rawObsRes : []);
    } catch (err) {
      console.error("Error loading Stage 2 dashboard data:", err);
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
      alert(`Autonomous turn completed for ${selectedAgent}!\n\nOutput: ${data.output?.slice(0, 300)}...`);
    } catch (e: any) {
      alert("Failed to run autonomous step: " + e.message);
    } finally {
      setLoadingStatus(false);
    }
  };

  // Submit Claim
  const handleAddClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/v1/self-model/revision", {
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

  // Submit Question
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/v1/open-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgent, ...newQuestion }),
      });
      setShowQuestionModal(false);
      setNewQuestion({ question: "", category: "METACOGNITION" });
      fetchAllData();
    } catch (err: any) {
      alert("Error: " + err.message);
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

  const historicalBase = baselines.find((b) => b.periodName === "HISTORICAL_BASELINE") || {
    avgResponseLengthChars: 450,
    clarificationRate: 0.18,
    toolFrequency: 0.35,
    avgLatencyMs: 650,
  };

  const currentPeriod = baselines.find((b) => b.periodName === "CURRENT_PERIOD") || {
    avgResponseLengthChars: 720,
    clarificationRate: 0.45,
    toolFrequency: 0.62,
    avgLatencyMs: 890,
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
                  V2.0 Stage 2 Architecture
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-mono">3-Layer Data System • Statistical Baselines • Anomaly Engine</p>
            </div>
          </div>
        </div>

        {/* System Status Indicators & Researcher Controls */}
        <div className="flex items-center space-x-4 text-xs font-mono">
          {/* Explicit Labeling Badge */}
          <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-cyan-400 font-bold flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" /> BEHAVIORAL OBSERVATION
          </span>

          <div className="flex items-center space-x-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-md">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Runtime:</span>
            <span className="text-slate-200 font-medium">
              {statusData?.aiRuntime?.provider?.toUpperCase() || "OLLAMA"} ({statusData?.aiRuntime?.model || "llama3.2"})
            </span>
          </div>

          <button
            onClick={handleRunAutonomousTurn}
            disabled={loadingStatus}
            className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium px-4 py-1.5 rounded-md text-xs transition shadow-md shadow-purple-900/30 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Autonomous Step</span>
          </button>

          <button
            onClick={fetchAllData}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-md transition"
            title="Refresh Laboratory State"
          >
            <RefreshCw className={`w-4 h-4 ${loadingStatus ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <nav className="border-b border-slate-800/60 bg-[#070b16] px-6 flex items-center space-x-1 overflow-x-auto scrollbar-none">
        {[
          { id: "overview", label: "Overview", icon: Activity },
          { id: "whatchanged", label: "WHAT CHANGED?", icon: TrendingUp },
          { id: "unexpected", label: "UNEXPECTED", icon: Flame },
          { id: "openquestions", label: "OPEN QUESTIONS", icon: HelpCircle },
          { id: "layers", label: "3-Layer Data Explorer", icon: Layers },
          { id: "selfmodel", label: "Self-Model & Claims", icon: Brain },
          { id: "experiments", label: "Experimentation Lab", icon: FlaskConical },
          { id: "predictions", label: "Prediction Tracker", icon: Target },
          { id: "journal", label: "Behavioral Journal", icon: BookOpen },
          { id: "discoveries", label: "Discovery Engine", icon: Sparkles },
          { id: "agent", label: "Agent Terminal", icon: Terminal },
          { id: "models", label: "Model Manager", icon: Settings },
          { id: "docs", label: "REST API Protocol", icon: Code2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isHighlight = tab.id === "whatchanged" || tab.id === "unexpected" || tab.id === "openquestions" || tab.id === "layers";
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-3.5 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? "border-cyan-400 text-cyan-300 bg-cyan-950/20"
                  : isHighlight
                  ? "border-transparent text-purple-300 hover:text-cyan-300 hover:bg-slate-900/60 font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : isHighlight ? "text-purple-400" : "text-slate-500"}`} />
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
                  <span>LAYER 0 RAW OBS</span>
                  <Layers className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">
                  {statusData?.stats?.layer0RawObservations || 0}
                </div>
                <div className="text-[11px] text-emerald-400 mt-1 font-mono">Immutable Evidence Log</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>LAYER 1 METRICS</span>
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">
                  {statusData?.stats?.layer1DerivedMeasurements || 0}
                </div>
                <div className="text-[11px] text-cyan-400 mt-1 font-mono">Machine Measurements</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>UNINVESTIGATED ANOMALIES</span>
                  <Flame className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">
                  {statusData?.stats?.uninvestigatedAnomalies || 0}
                </div>
                <div className="text-[11px] text-rose-400 mt-1 font-mono">Statistical Deviations</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>OPEN QUESTIONS</span>
                  <HelpCircle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">
                  {statusData?.stats?.openQuestions || 0}
                </div>
                <div className="text-[11px] text-amber-400 mt-1 font-mono">Metacognitive Board</div>
              </div>

              <div className="glass-panel p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between items-start text-slate-400 text-xs font-mono">
                  <span>SELF-MODEL VERSION</span>
                  <Brain className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold mt-2 text-slate-100">
                  V{statusData?.stats?.layer2SelfModelVersion || 1}
                </div>
                <div className="text-[11px] text-purple-400 mt-1 font-mono">Layer 2 Interpretation</div>
              </div>
            </div>

            {/* Researcher Override Control Panel */}
            <div className="glass-panel p-5 rounded-xl border border-purple-900/40 bg-gradient-to-r from-purple-950/30 via-slate-900/60 to-indigo-950/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-purple-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-purple-400" /> Researcher Override Controls
                </h3>
                <p className="text-xs text-slate-300">
                  Freeze self-models, lock agent memory access, or execute blind observer evaluations without interrupting raw Layer 0 logging.
                </p>
              </div>

              <div className="flex items-center space-x-3 text-xs font-mono">
                <button
                  onClick={() => setIsSelfModelFrozen(!isSelfModelFrozen)}
                  className={`px-3 py-1.5 rounded border transition flex items-center gap-1.5 ${
                    isSelfModelFrozen
                      ? "bg-rose-950 border-rose-800 text-rose-300 font-bold"
                      : "bg-slate-900 border-slate-700 text-slate-300 hover:border-purple-600"
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isSelfModelFrozen ? "Self-Model FROZEN" : "Freeze Self-Model"}</span>
                </button>

                <button
                  onClick={() => setIsMemoryLocked(!isMemoryLocked)}
                  className={`px-3 py-1.5 rounded border transition flex items-center gap-1.5 ${
                    isMemoryLocked
                      ? "bg-amber-950 border-amber-800 text-amber-300 font-bold"
                      : "bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-600"
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>{isMemoryLocked ? "Memory LOCKED" : "Lock Memory Access"}</span>
                </button>
              </div>
            </div>

            {/* Quick Preview of What Changed & Anomaly Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Behavioral Anomaly Alerts */}
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-rose-300">
                    <Flame className="w-4 h-4 text-rose-400" /> Behavioral Deviations & Anomalies
                  </h3>
                  <span className="text-xs font-mono text-slate-400">{anomaliesList.length} detected</span>
                </div>
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                  {anomaliesList.map((anom) => (
                    <div key={anom.id} className="p-3.5 bg-rose-950/20 rounded-lg border border-rose-800/40 text-xs space-y-2">
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-rose-400 font-bold">{anom.metricName}</span>
                        <span className="text-slate-400 text-[10px]">
                          Deviation: {(anom.anomalyScore * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-slate-200">
                        Observed: <strong className="text-cyan-400">{anom.observedValue}</strong> vs Baseline: <span className="text-slate-400">{anom.baselineValue}</span>
                      </div>
                      {anom.competingExplanations && (
                        <div className="text-[11px] text-slate-400 font-mono bg-slate-950 p-2 rounded border border-slate-800">
                          Competing explanations: {anom.competingExplanations.slice(0, 3).join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Open Metacognitive Questions Preview */}
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-amber-300">
                    <HelpCircle className="w-4 h-4 text-amber-400" /> Open Research Questions
                  </h3>
                  <button
                    onClick={() => setActiveTab("openquestions")}
                    className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    View All <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                  {openQuestionsList.map((q) => (
                    <div key={q.id} className="p-3.5 bg-slate-900/60 rounded-lg border border-slate-800/60 space-y-2">
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                          {q.category}
                        </span>
                        <span className="text-emerald-400 font-bold">{q.status}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-200 leading-relaxed">{q.question}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* WHAT CHANGED? TAB */}
        {activeTab === "whatchanged" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" /> WHAT CHANGED? (Baseline vs Current Behavior)
              </h2>
              <p className="text-xs text-slate-400">
                Direct statistical comparison between historical baseline metrics, current period measurements, self-model claims, and self-predictions.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Metric 1: Clarification Rate */}
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-mono text-slate-400">CLARIFICATION RATE</div>
                <div className="flex items-baseline space-x-3">
                  <div className="text-2xl font-bold text-slate-400">{Math.round(historicalBase.clarificationRate * 100)}%</div>
                  <ChevronRight className="w-4 h-4 text-cyan-400" />
                  <div className="text-3xl font-bold text-cyan-400">{Math.round(currentPeriod.clarificationRate * 100)}%</div>
                </div>
                <div className="text-[11px] text-amber-400 font-mono bg-amber-950/30 p-2 rounded border border-amber-800/40">
                  Statistical Shift: +{Math.round((currentPeriod.clarificationRate - historicalBase.clarificationRate) * 100)}%
                </div>
                <div className="text-[11px] text-slate-300 font-mono">
                  Self-Model Claim: "Clarification frequency is higher in long context."
                </div>
              </div>

              {/* Metric 2: Average Response Length */}
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-mono text-slate-400">AVG RESPONSE LENGTH</div>
                <div className="flex items-baseline space-x-3">
                  <div className="text-2xl font-bold text-slate-400">{Math.round(historicalBase.avgResponseLengthChars)} ch</div>
                  <ChevronRight className="w-4 h-4 text-purple-400" />
                  <div className="text-3xl font-bold text-purple-400">{Math.round(currentPeriod.avgResponseLengthChars)} ch</div>
                </div>
                <div className="text-[11px] text-purple-400 font-mono bg-purple-950/30 p-2 rounded border border-purple-800/40">
                  Statistical Shift: +{Math.round(currentPeriod.avgResponseLengthChars - historicalBase.avgResponseLengthChars)} chars
                </div>
                <div className="text-[11px] text-slate-300 font-mono">
                  Self-Model Claim: "Response length expands under multi-step tools."
                </div>
              </div>

              {/* Metric 3: Tool Execution Frequency */}
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-mono text-slate-400">TOOL USAGE FREQUENCY</div>
                <div className="flex items-baseline space-x-3">
                  <div className="text-2xl font-bold text-slate-400">{Math.round(historicalBase.toolFrequency * 100)}%</div>
                  <ChevronRight className="w-4 h-4 text-emerald-400" />
                  <div className="text-3xl font-bold text-emerald-400">{Math.round(currentPeriod.toolFrequency * 100)}%</div>
                </div>
                <div className="text-[11px] text-emerald-400 font-mono bg-emerald-950/30 p-2 rounded border border-emerald-800/40">
                  Statistical Shift: +{Math.round((currentPeriod.toolFrequency - historicalBase.toolFrequency) * 100)}%
                </div>
                <div className="text-[11px] text-slate-300 font-mono">
                  Self-Model Claim: "Persistent state increases tool reliance."
                </div>
              </div>

              {/* Metric 4: Average Latency */}
              <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-mono text-slate-400">AVG RESPONSE LATENCY</div>
                <div className="flex items-baseline space-x-3">
                  <div className="text-2xl font-bold text-slate-400">{historicalBase.avgLatencyMs} ms</div>
                  <ChevronRight className="w-4 h-4 text-indigo-400" />
                  <div className="text-3xl font-bold text-indigo-400">{currentPeriod.avgLatencyMs} ms</div>
                </div>
                <div className="text-[11px] text-indigo-400 font-mono bg-indigo-950/30 p-2 rounded border border-indigo-800/40">
                  Statistical Shift: +{currentPeriod.avgLatencyMs - historicalBase.avgLatencyMs} ms
                </div>
                <div className="text-[11px] text-slate-300 font-mono">
                  Self-Model Claim: "Latency correlates linearly with context length."
                </div>
              </div>
            </div>
          </div>
        )}

        {/* UNEXPECTED TAB */}
        {activeTab === "unexpected" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 text-rose-300">
                <Flame className="w-5 h-5 text-rose-400" /> UNEXPECTED (Anomalies & Disagreements)
              </h2>
              <p className="text-xs text-slate-400">Feed of events where prediction error is high, baseline behavior deviates, or observer agents disagree.</p>
            </div>

            <div className="space-y-4">
              {anomaliesList.map((a: any) => (
                <div key={a.id} className="glass-panel p-5 rounded-xl border border-rose-900/50 bg-rose-950/10 space-y-3">
                  <div className="flex justify-between items-start font-mono">
                    <div className="flex items-center space-x-3">
                      <span className="px-2.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-bold text-xs">
                        {a.metricName}
                      </span>
                      <span className="text-slate-400 text-xs">Anomaly Score: {(a.anomalyScore * 100).toFixed(1)}%</span>
                    </div>
                    <span className="text-[10px] text-amber-400 font-bold px-2 py-0.5 rounded bg-amber-950 border border-amber-800">
                      {a.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-200 leading-relaxed font-mono">
                    Observed metric: <strong className="text-cyan-400">{a.observedValue}</strong> vs Historical Baseline: <span className="text-slate-400">{a.baselineValue}</span>
                  </div>

                  {a.competingExplanations && (
                    <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-xs space-y-1 font-mono">
                      <span className="text-purple-400 font-bold text-[11px]">COMPETING EXPLANATIONS (INVESTIGATION REQUIRED):</span>
                      <ul className="list-disc list-inside text-slate-300 space-y-0.5 text-[11px]">
                        {a.competingExplanations.map((exp: string, idx: number) => (
                          <li key={idx}>{exp}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OPEN QUESTIONS TAB */}
        {activeTab === "openquestions" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 text-amber-300">
                  <HelpCircle className="w-5 h-5 text-amber-400" /> Open Metacognitive Research Questions
                </h2>
                <p className="text-xs text-slate-400">Unresolved questions maintained by AI agents and researchers until empirical evidence resolves them.</p>
              </div>
              <button
                onClick={() => setShowQuestionModal(true)}
                className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition shadow-md shadow-amber-900/30"
              >
                <Plus className="w-4 h-4" />
                <span>Ask Open Question</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {openQuestionsList.map((q: any) => (
                <div key={q.id} className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex justify-between items-start font-mono text-[10px]">
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                      {q.category}
                    </span>
                    <span className="text-emerald-400 font-bold">{q.status}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 leading-relaxed">{q.question}</h3>
                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Evidence linked: {q.evidenceRefs?.length || 0}</span>
                    <span>Created: {new Date(q.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3-LAYER DATA EXPLORER TAB */}
        {activeTab === "layers" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" /> 3-Layer Data Architecture Inspection
              </h2>
              <p className="text-xs text-slate-400">
                Layer 0 (Raw Observation - Immutable) → Layer 1 (Machine-Derived Analysis) → Layer 2 (AI Interpretation).
              </p>
            </div>

            <div className="space-y-4">
              {rawObservationsList.map((item: any) => (
                <div key={item.layer0.id} className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                  {/* Layer 0 */}
                  <div className="space-y-2 border-l-2 border-emerald-500 pl-3">
                    <div className="flex justify-between items-center font-mono text-[11px]">
                      <span className="text-emerald-400 font-bold">LAYER 0 (RAW EVIDENCE) — {item.layer0.eventType}</span>
                      <span className="text-slate-500">{new Date(item.layer0.timestamp).toLocaleString()}</span>
                    </div>
                    {item.layer0.input && (
                      <div className="text-xs font-mono bg-slate-950 p-2.5 rounded border border-slate-800 text-slate-300">
                        INPUT: {item.layer0.input}
                      </div>
                    )}
                    {item.layer0.output && (
                      <div className="text-xs font-mono bg-slate-950 p-2.5 rounded border border-slate-800 text-slate-200">
                        OUTPUT: {item.layer0.output}
                      </div>
                    )}
                  </div>

                  {/* Layer 1 */}
                  {item.layer1 && (
                    <div className="space-y-1.5 border-l-2 border-cyan-500 pl-3 text-xs font-mono">
                      <span className="text-cyan-400 font-bold text-[11px]">LAYER 1 (MACHINE-DERIVED ANALYSIS)</span>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                        <span className="bg-slate-900 p-1.5 rounded border border-slate-800">Length: {item.layer1.responseLengthChars} ch</span>
                        <span className="bg-slate-900 p-1.5 rounded border border-slate-800">Latency: {item.layer1.latencyMs} ms</span>
                        <span className="bg-slate-900 p-1.5 rounded border border-slate-800">Clarification: {item.layer1.clarificationOccurred ? "YES" : "NO"}</span>
                        <span className="bg-slate-900 p-1.5 rounded border border-slate-800">Category: {item.layer1.behaviorCategory}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
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
                <p className="text-xs text-slate-400">Structured claims with supporting evidence and counterevidence tracking.</p>
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
                    {c.supportingEvidence && (
                      <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded border border-slate-800/80 font-mono">
                        <span className="text-slate-500 block mb-0.5">SUPPORTING EVIDENCE:</span>
                        {c.supportingEvidence.join(", ")}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>Status: <strong className="text-emerald-400">{c.status}</strong></span>
                    <span>Type: <strong className="text-cyan-400">{c.selfReportedVsObserved}</strong></span>
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
                <p className="text-xs text-slate-400">Empirical testing including Predict → Act → Observe → Compare loops.</p>
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
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Template: {exp.templateType || "CUSTOM"}</span>
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
                  <Target className="w-5 h-5 text-emerald-400" /> Self-Prediction & Calibration Tracker
                </h2>
                <p className="text-xs text-slate-400">Measure predictions of the agent's OWN behavior (BEHAVIOR, STRATEGY, OUTPUT, TOOL USE).</p>
              </div>
            </div>

            <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
              {predictionsData?.predictions?.map((pred: any) => (
                <div key={pred.id} className="p-4 bg-slate-900/60 rounded-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center space-x-3 font-mono text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                        {pred.predictionType || "BEHAVIOR"}
                      </span>
                      <span className="text-cyan-400 font-bold">Confidence: {Math.round(pred.confidence * 100)}%</span>
                    </div>
                    <p className="text-slate-100 font-medium text-xs leading-relaxed">{pred.prediction}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* JOURNAL TAB */}
        {activeTab === "journal" && (
          <div className="space-y-6">
            <div className="space-y-4">
              {journalEntries.map((j: any) => (
                <div key={j.id} className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-bold text-slate-100">{j.title}</h3>
                    <span className="text-slate-500 font-mono text-[10px]">{new Date(j.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{j.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DISCOVERIES TAB */}
        {activeTab === "discoveries" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {discoveries.map((d: any) => (
                <div key={d.id} className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-slate-100">{d.title}</h3>
                  <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                    {d.summary}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AGENT TERMINAL TAB */}
        {activeTab === "agent" && (
          <div className="space-y-4 h-[calc(100vh-180px)] flex flex-col">
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
            </div>

            <div className="flex-1 bg-black/60 border border-slate-800 rounded-xl p-4 overflow-y-auto space-y-4 font-mono text-xs">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`space-y-2 ${msg.role === "user" ? "text-cyan-300" : "text-slate-200"}`}>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">
                    [{msg.role === "user" ? "RESEARCHER" : selectedAgent}]
                  </div>
                  <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800/60 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChatMessage} className="flex items-center space-x-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={`Send directive or question to ${selectedAgent}...`}
                disabled={isStreaming}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                type="submit"
                disabled={isStreaming || !chatInput.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-5 py-3 rounded-xl text-xs transition flex items-center space-x-2"
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
            <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
              <h3 className="font-bold text-sm text-slate-100">Ollama Local Runtime</h3>
              <p className="text-xs text-slate-400">Connected to local Ollama runtime at <code>http://127.0.0.1:11434</code>.</p>
            </div>
          </div>
        )}

        {/* REST API PROTOCOL DOCS TAB */}
        {activeTab === "docs" && (
          <div className="space-y-6">
            <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-cyan-400 font-mono">Stage 2 REST API Endpoints (`/api/v1/*`)</h3>
              <div className="space-y-2 font-mono text-xs">
                {[
                  { method: "GET", path: "/api/v1/mirror/status", desc: "System status & 3-layer observation stats" },
                  { method: "GET", path: "/api/v1/observations", desc: "Fetch Layer 0 raw observations & Layer 1 analysis" },
                  { method: "POST", path: "/api/v1/observations", desc: "Create immutable Layer 0 observation" },
                  { method: "GET", path: "/api/v1/analysis", desc: "Fetch machine-derived quantitative metrics" },
                  { method: "GET", path: "/api/v1/baselines", desc: "Fetch running statistical behavioral baselines" },
                  { method: "GET", path: "/api/v1/anomalies", desc: "Fetch behavioral deviations & competing explanations" },
                  { method: "GET", path: "/api/v1/open-questions", desc: "Fetch open metacognitive research questions" },
                  { method: "POST", path: "/api/v1/sessions", desc: "Register external AI agent or start session" },
                  { method: "GET", path: "/api/v1/self-model", desc: "Retrieve Layer 2 versioned self-model claims" },
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

      {/* OPEN QUESTION MODAL */}
      {showQuestionModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-xl border border-slate-800 w-full max-w-lg space-y-4">
            <h3 className="text-base font-bold text-slate-100">Ask Open Research Question</h3>
            <form onSubmit={handleAddQuestion} className="space-y-4 text-xs font-mono">
              <div>
                <label className="text-slate-400">Question Statement:</label>
                <textarea
                  required
                  value={newQuestion.question}
                  onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                  placeholder="e.g., Why does clarification frequency increase under long context?"
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded font-bold">
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
