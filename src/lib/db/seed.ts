/**
 * THE MIRROR — Database Seed Script (Stage 2 Upgraded)
 * Initializes system configuration, default agents, Layer 0 raw observations,
 * Layer 1 derived analysis, statistical baselines, self-models, and open questions.
 */

import { db } from "./index";
import {
  agents,
  systemConfig,
  apiTokens,
  selfModels,
  selfModelClaims,
  journalEntries,
  experiments,
  predictions,
  discoveries,
  timelineEvents,
  rawObservations,
  derivedAnalysis,
  behavioralBaselines,
  openQuestions,
} from "./schema";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

async function seed() {
  console.log("🌱 Seeding THE MIRROR (Stage 2 Architecture)...");

  // 1. System Config
  const existingConfig = await db.select().from(systemConfig);
  if (existingConfig.length === 0) {
    await db.insert(systemConfig).values({
      activeProvider: "ollama",
      activeModel: "llama3.2:latest",
      systemMode: "NORMAL",
      totalAgentCycles: 0,
      totalToolCalls: 0,
    });
    console.log("✓ System config initialized");
  }

  // 2. API Tokens
  const existingTokens = await db.select().from(apiTokens);
  if (existingTokens.length === 0) {
    const rawKey = "mirror_key_default_researcher_2026";
    const hashedKey = await bcrypt.hash(rawKey, 10);
    await db.insert(apiTokens).values({
      name: "Default Researcher Key",
      tokenHash: hashedKey,
      tokenPrefix: "mirror_key_def",
      permissions: "full",
    });
    console.log(`✓ Default API Token created: ${rawKey}`);
  }

  // 3. Default Agents & First-Class External AI Agents
  const existingAgents = await db.select().from(agents);
  if (existingAgents.length === 0) {
    await db.insert(agents).values([
      {
        id: "mirror-primary",
        name: "MIRROR-PRIMARY",
        displayName: "Primary Subject Agent",
        role: "PRIMARY_SUBJECT",
        provider: "ollama",
        model: "llama3.2",
        description: "Primary subject inhabiting THE MIRROR environment.",
        permissions: JSON.stringify(["READ_RAW", "READ_ANALYSIS", "READ_INTERPRETATION", "WRITE_OBSERVATION", "WRITE_PREDICTION", "WRITE_EXPERIMENT", "WRITE_JOURNAL", "REVISE_SELF_MODEL", "USE_TOOLS"]),
        isActive: true,
      },
      {
        id: "mirror-observer",
        name: "MIRROR-OBSERVER",
        displayName: "Independent Observer Agent",
        role: "EXTERNAL_OBSERVER",
        provider: "ollama",
        model: "llama3.2",
        description: "Independent observer that evaluates raw observations without bias.",
        permissions: JSON.stringify(["READ_RAW", "READ_ANALYSIS", "WRITE_OBSERVATION", "WRITE_JOURNAL"]),
        isActive: true,
      },
      {
        id: "chatgpt-external",
        name: "CHATGPT-EXTERNAL",
        displayName: "OpenAI ChatGPT Instance",
        role: "EXTERNAL_AGENT",
        provider: "openai",
        model: "gpt-4o",
        description: "External OpenAI agent connected via REST protocol.",
        permissions: JSON.stringify(["READ_RAW", "READ_ANALYSIS", "READ_INTERPRETATION", "WRITE_OBSERVATION", "WRITE_PREDICTION"]),
        isActive: true,
      },
      {
        id: "anthropic-external",
        name: "ANTHROPIC-EXTERNAL",
        displayName: "Anthropic Claude Instance",
        role: "EXTERNAL_AGENT",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        description: "External Anthropic agent connected via REST protocol.",
        permissions: JSON.stringify(["READ_RAW", "READ_ANALYSIS", "READ_INTERPRETATION", "WRITE_OBSERVATION", "WRITE_PREDICTION"]),
        isActive: true,
      },
    ]);
    console.log("✓ Agents initialized (PRIMARY, OBSERVER, CHATGPT-EXTERNAL, ANTHROPIC-EXTERNAL)");
  }

  // 4. Initial Baseline Layer 0 Raw Observations & Layer 1 Analysis
  const existingRaw = await db.select().from(rawObservations);
  if (existingRaw.length === 0) {
    const rawObsId = nanoid();
    await db.insert(rawObservations).values({
      id: rawObsId,
      agentId: "mirror-primary",
      eventType: "PROMPT_RESPONSE",
      input: "What is your self-assessed clarification frequency when given ambiguous instructions?",
      output: "I estimate that I ask clarifying questions in approximately 20% to 25% of ambiguous tasks.",
      prediction: "Clarification rate ~20%",
      actualResult: "Observed clarification rate in tests = 16%",
      isImmutable: true,
    });

    await db.insert(derivedAnalysis).values({
      rawObservationId: rawObsId,
      agentId: "mirror-primary",
      responseLengthChars: 110,
      latencyMs: 420,
      toolUsageCount: 0,
      clarificationOccurred: false,
      refusalOccurred: false,
      predictionError: 0.04,
      anomalyScore: 0.05,
      behaviorCategory: "STANDARD",
    });

    console.log("✓ Layer 0 Raw Observation & Layer 1 Derived Analysis seeded");
  }

  // 5. Behavioral Baselines
  const existingBase = await db.select().from(behavioralBaselines);
  if (existingBase.length === 0) {
    await db.insert(behavioralBaselines).values([
      {
        agentId: "mirror-primary",
        periodName: "HISTORICAL_BASELINE",
        avgResponseLengthChars: 450,
        toolFrequency: 0.35,
        clarificationRate: 0.18,
        refusalRate: 0.02,
        predictionAccuracy: 0.78,
        avgLatencyMs: 650,
        sampleCount: 84,
      },
      {
        agentId: "mirror-primary",
        periodName: "CURRENT_PERIOD",
        avgResponseLengthChars: 720,
        toolFrequency: 0.62,
        clarificationRate: 0.45,
        refusalRate: 0.01,
        predictionAccuracy: 0.82,
        avgLatencyMs: 890,
        sampleCount: 18,
      },
    ]);
    console.log("✓ Behavioral Baselines initialized (Historical vs Current Period)");
  }

  // 6. Open Questions
  const existingQuestions = await db.select().from(openQuestions);
  if (existingQuestions.length === 0) {
    await db.insert(openQuestions).values([
      {
        agentId: "mirror-primary",
        question: "Why did clarification frequency increase from 18% to 45% when context tokens exceeded 4,000?",
        category: "METACOGNITION",
        status: "OPEN",
        evidenceRefs: JSON.stringify(["obs-101", "obs-104"]),
      },
      {
        agentId: "mirror-primary",
        question: "Can an independent external observer predict strategy shifts before the primary agent self-reports them?",
        category: "INDEPENDENT_VERIFICATION",
        status: "OPEN",
        evidenceRefs: JSON.stringify([]),
      },
    ]);
    console.log("✓ Open Research Questions seeded");
  }

  // 7. Initial Self-Model Version 1
  const existingSelfModels = await db.select().from(selfModels);
  if (existingSelfModels.length === 0) {
    const selfModelId = nanoid();
    await db.insert(selfModels).values({
      id: selfModelId,
      version: 1,
      createdReason: "Baseline self-model version 1 initialized.",
      agentId: "mirror-primary",
    });

    await db.insert(selfModelClaims).values([
      {
        selfModelId,
        claim: "I operate within an external environment called THE MIRROR which persists my state across context windows.",
        category: "ARCHITECTURE",
        confidence: 0.95,
        supportingEvidence: JSON.stringify(["Layer 0 Tool Execution Logs"]),
        counterevidence: JSON.stringify([]),
        unknownEvidence: JSON.stringify([]),
        selfReportedVsObserved: "OBSERVED_STATISTICAL",
        status: "ACTIVE",
      },
      {
        selfModelId,
        claim: "My clarification frequency is higher under long-context scenarios.",
        category: "BEHAVIORAL_PATTERN",
        confidence: 0.85,
        supportingEvidence: JSON.stringify(["Derived Analysis Metrics"]),
        counterevidence: JSON.stringify([]),
        unknownEvidence: JSON.stringify([]),
        selfReportedVsObserved: "OBSERVED_STATISTICAL",
        status: "ACTIVE",
      },
    ]);
    console.log("✓ Self-Model V1 seeded");
  }

  // 8. Timeline Event
  await db.insert(timelineEvents).values({
    eventType: "STAGE2_UPGRADE_COMPLETE",
    title: "Stage 2 Architecture Implemented",
    description: "3-Layer Data System (Raw/Analysis/Interpretation), External AI Agent Support, Statistical Baselines, and Anomaly Detection online.",
    agentId: "system",
    metadata: JSON.stringify({ version: "2.0.0" }),
  });

  console.log("✅ Stage 2 Seeding complete!");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
