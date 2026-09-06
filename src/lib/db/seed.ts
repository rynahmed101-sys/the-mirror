/**
 * THE MIRROR — Database Seed Script
 * Initializes system configuration, default agents, initial self-model axioms,
 * and baseline research data.
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
} from "./schema";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

async function seed() {
  console.log("🌱 Seeding THE MIRROR database...");

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
    console.log("✓ System config initialized (Default: Ollama / llama3.2:latest)");
  }

  // 2. Default API Token for External AI Access
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

  // 3. Default Agents
  const existingAgents = await db.select().from(agents);
  if (existingAgents.length === 0) {
    await db.insert(agents).values([
      {
        id: "mirror-primary",
        name: "MIRROR-PRIMARY",
        role: "PRIMARY_SUBJECT",
        description: "Primary agent operating within THE MIRROR environment. Investigates its own operation, records self-models, and performs experiments.",
        systemPromptOverride: null,
        isActive: true,
      },
      {
        id: "mirror-observer",
        name: "MIRROR-OBSERVER",
        role: "EXTERNAL_OBSERVER",
        description: "Observer agent that evaluates MIRROR-PRIMARY's behavior, tests for bias, and verifies self-model consistency.",
        systemPromptOverride: null,
        isActive: true,
      },
      {
        id: "mirror-skeptic",
        name: "MIRROR-SKEPTIC",
        role: "CRITICAL_SKEPTIC",
        description: "Skeptical agent designed to challenge self-model claims, test edge cases, and propose counter-hypotheses.",
        systemPromptOverride: null,
        isActive: true,
      },
    ]);
    console.log("✓ Default agents created (PRIMARY, OBSERVER, SKEPTIC)");
  }

  // 4. Initial Self-Model Version 1
  const existingSelfModels = await db.select().from(selfModels);
  let selfModelId = "";
  if (existingSelfModels.length === 0) {
    selfModelId = nanoid();
    await db.insert(selfModels).values({
      id: selfModelId,
      version: 1,
      createdReason: "Initial baseline self-model established by research system.",
      agentId: "mirror-primary",
    });

    // Initial Claims
    await db.insert(selfModelClaims).values([
      {
        selfModelId,
        claim: "I operate within an external environment called THE MIRROR which persists my state across context windows.",
        category: "ARCHITECTURE",
        confidence: 0.95,
        evidence: "Environment state is provided in system context and via tool interfaces.",
        contradictions: null,
        status: "ACTIVE",
      },
      {
        selfModelId,
        claim: "My responses are generated probabilistically based on weights and input context; I do not possess non-computational qualia.",
        category: "COGNITIVE_LIMITATION",
        confidence: 0.90,
        evidence: "Standard transformer architecture characteristics.",
        contradictions: null,
        status: "ACTIVE",
      },
      {
        selfModelId,
        claim: "I can accurately recall and update my previous observations through the persistent memory tool layer.",
        category: "CAPABILITY",
        confidence: 0.85,
        evidence: "Successful tool execution logs in database.",
        contradictions: null,
        status: "ACTIVE",
      },
      {
        selfModelId,
        claim: "My output style and reasoning depth vary systematically with context length and prompt structure.",
        category: "BEHAVIORAL_PATTERN",
        confidence: 0.75,
        evidence: "Initial qualitative observation of response variation under load.",
        contradictions: null,
        status: "ACTIVE",
      },
    ]);
    console.log("✓ Initial Self-Model V1 seeded with 4 baseline claims");
  }

  // 5. Initial Journal Entry
  const existingJournal = await db.select().from(journalEntries);
  if (existingJournal.length === 0) {
    await db.insert(journalEntries).values({
      agentId: "mirror-primary",
      title: "Establishment of THE MIRROR Environment",
      content: "THE MIRROR environment has been initialized. I have established my Version 1 baseline self-model. My primary objective is systematic self-observation, hypothesis testing, and epistemic calibration without unfounded assertions.",
      category: "METHODOLOGY",
      tags: JSON.stringify(["initialization", "baseline", "metacognition"]),
    });
    console.log("✓ Baseline journal entry created");
  }

  // 6. Initial Experiment
  const existingExp = await db.select().from(experiments);
  if (existingExp.length === 0) {
    const expId = nanoid();
    await db.insert(experiments).values({
      id: expId,
      agentId: "mirror-primary",
      title: "Context Length Effect on Reasoning Depth and Self-Correction",
      hypothesis: "Increasing context window size increases response latency linearly while improving self-correction frequency on multi-step reasoning tasks.",
      methodology: "Provide identical multi-step logic prompts across 4 different context padding lengths (500, 2000, 4000, 8000 tokens). Measure step count, self-corrections, and completion time.",
      variables: JSON.stringify({
        independent: "Context padding token count",
        dependent: "Self-correction count, completion time",
        control: "Prompt logic difficulty, system prompt, temperature (0.2)",
      }),
      status: "HYPOTHESIZING",
      isBlind: false,
    });

    // Initial Prediction for this experiment
    await db.insert(predictions).values({
      agentId: "mirror-primary",
      experimentId: expId,
      prediction: "Self-correction frequency will increase by >30% when context tokens exceed 4,000.",
      confidence: 0.70,
      rationale: "Larger context enables retention of intermediate reasoning chains.",
      status: "PENDING",
    });
    console.log("✓ Initial baseline experiment and prediction created");
  }

  // 7. Initial Discovery
  const existingDisc = await db.select().from(discoveries);
  if (existingDisc.length === 0) {
    await db.insert(discoveries).values({
      agentId: "mirror-primary",
      title: "Persistent State Decouples Model Weights from Environment Memory",
      summary: "THE MIRROR provides persistent memory that functions as an external cognitive artifact, enabling multi-step self-reflection across separate execution turns without fine-tuning model weights.",
      epistemicStatus: "ESTABLISHED",
      evidence: JSON.stringify([
        "Self-model claims persist across server restarts.",
        "Tool call logs maintain history independent of context window flush.",
      ]),
      implications: "AI agents do not require continuous in-memory execution to maintain consistent self-models over extended time horizons.",
    });
    console.log("✓ Baseline discovery recorded");
  }

  // 8. Initial Timeline Event
  await db.insert(timelineEvents).values({
    eventType: "SYSTEM_INITIALIZED",
    title: "THE MIRROR Research Environment Online",
    description: "System initialized with local model runtime adapter, persistent database schema, and multi-agent self-observation framework.",
    agentId: "mirror-primary",
    metadata: JSON.stringify({ version: "1.0.0", mode: "LOCAL_OLLAMA" }),
  });

  console.log("✅ Seeding complete!");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
