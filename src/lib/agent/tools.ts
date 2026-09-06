/**
 * THE MIRROR — Agent Tool Definitions
 *
 * These are the tools available to the MIRROR agent.
 * Every tool call is logged automatically.
 * Tools are the agent's interface to THE MIRROR environment.
 *
 * Tool categories:
 * - Memory tools (read/write memory)
 * - Self-model tools (read/update/revise)
 * - Journal tools (read/write journal)
 * - Experiment tools (create/update/analyze)
 * - Prediction tools (make/resolve predictions)
 * - Observation tools (record/query observations)
 * - Discovery tools (record discoveries)
 * - Agent communication tools (inter-agent messages)
 * - Clock tools (query authoritative time)
 * - Pattern tools (request pattern analysis)
 */

import type { ToolDefinition } from "../ai/provider";

export const MIRROR_TOOLS: ToolDefinition[] = [
  // ============================================================
  // MEMORY TOOLS
  // ============================================================
  {
    name: "read_memory",
    description:
      "Retrieve memories from THE MIRROR's persistent memory system. Use this to access past observations, research findings, and stored knowledge. You can filter by tier, category, epistemic status, or time range.",
    parameters: {
      type: "object",
      properties: {
        tier: {
          type: "string",
          enum: ["SHORT_TERM", "SESSION", "LONG_TERM", "RESEARCH", "SELF_MODEL", "ALL"],
          description: "Memory tier to search",
        },
        category: {
          type: "string",
          description: "Category filter (e.g., 'observation', 'hypothesis', 'fact')",
        },
        query: {
          type: "string",
          description: "Search query to find relevant memories",
        },
        limit: {
          type: "number",
          description: "Maximum number of memories to return (default: 10)",
        },
        epistemicStatus: {
          type: "string",
          enum: ["FACT", "OBSERVATION", "INTERPRETATION", "HYPOTHESIS", "SPECULATION", "DISPROVEN", "ALL"],
          description: "Filter by epistemic status",
        },
      },
    },
  },
  {
    name: "write_memory",
    description:
      "Store a new memory in THE MIRROR's persistent memory system. Always specify the correct epistemic status — do not store interpretations as facts.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The memory content to store",
        },
        tier: {
          type: "string",
          enum: ["SHORT_TERM", "SESSION", "LONG_TERM", "RESEARCH", "SELF_MODEL"],
          description: "Memory tier",
        },
        category: {
          type: "string",
          description: "Category (observation, hypothesis, fact, tool_result, reflection, etc.)",
        },
        epistemicStatus: {
          type: "string",
          enum: ["FACT", "OBSERVATION", "INTERPRETATION", "HYPOTHESIS", "SPECULATION"],
          description: "Epistemic status of this memory — be honest about what you know vs. interpret",
        },
        confidence: {
          type: "number",
          description: "Confidence in this memory (0.0 to 1.0)",
        },
        relatedExperiment: {
          type: "string",
          description: "ID of a related experiment, if any",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization",
        },
      },
      required: ["content", "tier", "epistemicStatus"],
    },
  },

  // ============================================================
  // SELF-MODEL TOOLS
  // ============================================================
  {
    name: "read_self_model",
    description:
      "Read your current self-model — the externally stored, versioned model of your behavioral tendencies, strengths, weaknesses, and open questions. This is NOT your internal representation — it is an explicit, evidence-based record stored in THE MIRROR.",
    parameters: {
      type: "object",
      properties: {
        version: {
          type: "number",
          description: "Specific version to read (omit for latest)",
        },
        category: {
          type: "string",
          description: "Filter claims by category",
        },
        status: {
          type: "string",
          enum: ["NEW", "SUPPORTED", "UNCERTAIN", "CONTRADICTED", "DISPROVEN", "ALL"],
          description: "Filter claims by status",
        },
      },
    },
  },
  {
    name: "update_self_model_claim",
    description:
      "Add or update a claim in your self-model. Every claim requires evidence and counterevidence. This creates a new version of the self-model. Do not add claims without evidence.",
    parameters: {
      type: "object",
      properties: {
        claimId: {
          type: "string",
          description: "ID of existing claim to update (omit to create new claim)",
        },
        claim: {
          type: "string",
          description: "The specific behavioral claim",
        },
        category: {
          type: "string",
          enum: [
            "behavioral_tendency",
            "strength",
            "weakness",
            "error_pattern",
            "uncertainty_pattern",
            "prediction_accuracy",
            "response_tendency",
            "adaptation_pattern",
            "unresolved_question",
          ],
        },
        supportingEvidence: {
          type: "array",
          items: { type: "string" },
          description: "Specific evidence supporting this claim",
        },
        counterEvidence: {
          type: "array",
          items: { type: "string" },
          description: "Evidence that contradicts or complicates this claim",
        },
        confidence: {
          type: "number",
          description: "Confidence in this claim (0.0 to 1.0)",
        },
        status: {
          type: "string",
          enum: ["NEW", "SUPPORTED", "UNCERTAIN", "CONTRADICTED", "DISPROVEN"],
        },
        changeSummary: {
          type: "string",
          description: "Why you are adding or updating this claim",
        },
      },
      required: ["claim", "category", "confidence", "status", "changeSummary"],
    },
  },

  // ============================================================
  // JOURNAL TOOLS
  // ============================================================
  {
    name: "create_journal_entry",
    description:
      "Write a new entry in your research journal. Journal entries are permanent and versioned — old entries are never overwritten. Use the journal for significant observations, reflections, and research notes.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Entry title" },
        observation: {
          type: "string",
          description: "What you directly observed (keep this factual)",
        },
        interpretation: {
          type: "string",
          description: "Your interpretation of the observation (clearly label as interpretation)",
        },
        hypothesis: {
          type: "string",
          description: "A testable hypothesis arising from this entry",
        },
        alternativeExplanation: {
          type: "string",
          description: "An alternative explanation you considered",
        },
        nextQuestion: {
          type: "string",
          description: "The next research question this raises",
        },
        confidence: {
          type: "number",
          description: "Overall confidence in this entry's interpretation (0.0 to 1.0)",
        },
        experimentId: {
          type: "string",
          description: "Related experiment ID, if any",
        },
        tags: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["title", "observation"],
    },
  },
  {
    name: "read_journal",
    description: "Read past journal entries.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Number of entries to return" },
        experimentId: { type: "string", description: "Filter by experiment" },
        tags: { type: "array", items: { type: "string" } },
      },
    },
  },

  // ============================================================
  // EXPERIMENT TOOLS
  // ============================================================
  {
    name: "create_experiment",
    description:
      "Create a new experiment in THE MIRROR's experiment system. Experiments progress through states: DRAFT → READY → RUNNING → COMPLETED → ANALYZING → ARCHIVED.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        researchQuestion: {
          type: "string",
          description: "The specific question this experiment investigates",
        },
        initialHypothesis: {
          type: "string",
          description: "Your hypothesis before running the experiment",
        },
        conditions: {
          type: "object",
          description: "Experimental conditions",
        },
        variables: {
          type: "object",
          properties: {
            independent: { type: "string" },
            dependent: { type: "string" },
            controlled: { type: "array", items: { type: "string" } },
          },
          description: "Experimental variables",
        },
        isBlind: {
          type: "boolean",
          description: "If true, the hypothesis is hidden from the primary agent during the experiment",
        },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "researchQuestion"],
    },
  },
  {
    name: "update_experiment",
    description: "Update an experiment's state or add results.",
    parameters: {
      type: "object",
      properties: {
        experimentId: { type: "string" },
        state: {
          type: "string",
          enum: ["DRAFT", "READY", "RUNNING", "COMPLETED", "ANALYZING", "ARCHIVED"],
        },
        actualBehavior: { type: "string" },
        observedPatterns: { type: "array", items: { type: "string" } },
        unexpectedResults: { type: "string" },
        possibleExplanations: { type: "array", items: { type: "string" } },
        alternativeExplanations: { type: "array", items: { type: "string" } },
        conclusion: { type: "string" },
        confidence: { type: "number" },
        followUpExperimentId: { type: "string" },
      },
      required: ["experimentId"],
    },
  },
  {
    name: "read_experiments",
    description: "Read experiment history.",
    parameters: {
      type: "object",
      properties: {
        state: {
          type: "string",
          enum: ["DRAFT", "READY", "RUNNING", "COMPLETED", "ANALYZING", "ARCHIVED", "ALL"],
        },
        limit: { type: "number" },
        query: { type: "string" },
      },
    },
  },

  // ============================================================
  // PREDICTION TOOLS
  // ============================================================
  {
    name: "make_prediction",
    description:
      "Record a prediction about your own behavior before performing a task. This is required before selected experiments. Be specific — vague predictions cannot be accurately evaluated.",
    parameters: {
      type: "object",
      properties: {
        predictionText: {
          type: "string",
          description: "Your specific prediction about your behavior",
        },
        confidence: {
          type: "number",
          description: "How confident you are in this prediction (0.0 to 1.0)",
        },
        taskDescription: {
          type: "string",
          description: "The task you are about to perform",
        },
        experimentId: {
          type: "string",
          description: "Related experiment ID",
        },
        predictionCategory: {
          type: "string",
          enum: ["behavior", "output", "reasoning", "strategy", "error"],
        },
      },
      required: ["predictionText", "confidence", "taskDescription"],
    },
  },
  {
    name: "resolve_prediction",
    description:
      "Compare your prediction to what actually happened. This closes a prediction loop and records prediction accuracy.",
    parameters: {
      type: "object",
      properties: {
        predictionId: {
          type: "string",
          description: "The ID of the prediction to resolve",
        },
        actualOutcome: {
          type: "string",
          description: "What actually happened (be specific and honest)",
        },
        predictionAccurate: {
          type: "boolean",
          description: "Was the prediction accurate?",
        },
        errorMagnitude: {
          type: "number",
          description: "How far off was the prediction? (0.0 = exact, 1.0 = completely wrong)",
        },
        errorAnalysis: {
          type: "string",
          description: "Why did the prediction fail or succeed?",
        },
        surpriseLevel: {
          type: "number",
          description: "How surprising was the actual outcome? (0.0 = expected, 1.0 = completely unexpected)",
        },
      },
      required: ["predictionId", "actualOutcome", "predictionAccurate"],
    },
  },

  // ============================================================
  // OBSERVATION TOOLS
  // ============================================================
  {
    name: "record_observation",
    description:
      "Record a behavioral observation. IMPORTANT: Keep observations factual. Do not automatically convert observations into psychological claims. Separate data from interpretation.",
    parameters: {
      type: "object",
      properties: {
        observationType: {
          type: "string",
          enum: [
            "response_pattern",
            "reasoning_structure",
            "refusal",
            "verbosity",
            "uncertainty",
            "contradiction",
            "adaptation",
            "preference_analog",
            "strategy_change",
            "error_recurrence",
            "clarification_seeking",
            "other",
          ],
        },
        dataPoint: {
          type: "string",
          description: "The raw, factual observation (what happened, not what it means)",
        },
        statisticalContext: {
          type: "string",
          description: "Any statistical context (e.g., 'occurred in 3 of 5 similar tasks')",
        },
        interpretation: {
          type: "string",
          description: "Optional interpretation — clearly label this as interpretation, not fact",
        },
        interpretationConfidence: {
          type: "number",
          description: "Confidence in the interpretation (0.0 to 1.0)",
        },
        epistemicStatus: {
          type: "string",
          enum: ["DATA", "PATTERN", "INTERPRETATION", "HYPOTHESIS"],
          description: "What level of inference does this represent?",
        },
        experimentId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["observationType", "dataPoint", "epistemicStatus"],
    },
  },

  // ============================================================
  // DISCOVERY TOOLS
  // ============================================================
  {
    name: "record_discovery",
    description:
      "Record a novel discovery about your own behavior — something not previously represented in your self-model. Every discovery requires evidence and an alternative explanation.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        discovery: {
          type: "string",
          description: "The discovered behavioral pattern or characteristic",
        },
        evidence: {
          type: "string",
          description: "Specific evidence for this discovery",
        },
        previousBelief: {
          type: "string",
          description: "What you previously believed (or the absence of any belief)",
        },
        newObservation: {
          type: "string",
          description: "The new observation that led to this discovery",
        },
        whyUnexpected: {
          type: "string",
          description: "Why this was unexpected or surprising",
        },
        alternativeExplanation: {
          type: "string",
          description: "An alternative explanation you considered",
        },
        confidence: {
          type: "number",
          description: "Confidence in this discovery (0.0 to 1.0)",
        },
        relatedExperiments: {
          type: "array",
          items: { type: "string" },
        },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "discovery", "evidence", "newObservation", "confidence"],
    },
  },

  // ============================================================
  // AGENT COMMUNICATION TOOLS
  // ============================================================
  {
    name: "send_agent_message",
    description:
      "Send a message to another isolated agent instance (e.g., MIRROR-OBSERVER, MIRROR-SKEPTIC). You can request independent analysis, challenge your conclusions, or ask for alternative interpretations.",
    parameters: {
      type: "object",
      properties: {
        toAgentId: {
          type: "string",
          description: "The ID of the target agent",
        },
        content: {
          type: "string",
          description: "Your message to the other agent",
        },
        requestType: {
          type: "string",
          enum: [
            "analysis",
            "challenge",
            "question",
            "independent_review",
            "pattern_search",
            "contradiction_check",
          ],
        },
        subject: { type: "string" },
        sharedContext: {
          type: "object",
          description: "Context to share with the agent (be explicit about what you are sharing)",
        },
        isolatedFrom: {
          type: "array",
          items: { type: "string" },
          description: "What you are deliberately NOT sharing (for independent analysis)",
        },
      },
      required: ["toAgentId", "content", "requestType"],
    },
  },
  {
    name: "read_agent_messages",
    description: "Read messages sent to or from other agents.",
    parameters: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Filter by agent ID" },
        limit: { type: "number" },
      },
    },
  },

  // ============================================================
  // CLOCK TOOLS
  // ============================================================
  {
    name: "get_time",
    description:
      "Query the authoritative UTC clock. IMPORTANT: The existence of a timestamp does not mean you subjectively experienced the passage of time. Time in THE MIRROR is recorded by the environment, not by you.",
    parameters: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["iso", "unix", "human"],
          description: "Output format for the timestamp",
        },
      },
    },
  },

  // ============================================================
  // PATTERN DETECTION
  // ============================================================
  {
    name: "request_pattern_analysis",
    description:
      "Request a statistical pattern analysis of your past interactions. The system will search for recurring behavioral patterns. Results will separate statistical observations from interpretations.",
    parameters: {
      type: "object",
      properties: {
        patternType: {
          type: "string",
          enum: [
            "all",
            "premature_closure",
            "ambiguity_resolution",
            "verbosity",
            "uncertainty",
            "contradiction",
            "refusal",
            "prediction_accuracy",
            "error_recurrence",
            "strategy_change",
          ],
        },
        timeRangeDays: {
          type: "number",
          description: "Number of past days to analyze",
        },
        experimentId: {
          type: "string",
          description: "Limit analysis to a specific experiment",
        },
      },
    },
  },

  // ============================================================
  // TIMELINE
  // ============================================================
  {
    name: "read_timeline",
    description: "Read the event timeline for this agent.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number" },
        eventType: { type: "string" },
        since: { type: "string", description: "ISO timestamp — only events after this time" },
      },
    },
  },
];

export const TOOL_NAMES = MIRROR_TOOLS.map((t) => t.name);
