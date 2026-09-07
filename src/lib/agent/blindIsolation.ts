/**
 * THE MIRROR — Centralized Blind Experiment Runtime Isolation Engine
 *
 * Enforces runtime access control over blind experiments.
 * When is_blind = true, subject agents (primary, observer, skeptic, external AIs)
 * CANNOT access:
 * - hidden_config
 * - hidden hypothesis / research_hypothesis
 * - target_behavior
 * - expected_pattern
 *
 * Access is denied across:
 * - Direct API calls
 * - Agent tool calls (read_experiments, etc.)
 * - Memory retrieval & provenance
 * - Prompt construction
 *
 * Hidden configuration is accessible ONLY after explicit reveal.
 */

import { sqlite } from "../db";
import { appendRawEventLedger } from "./eventLedger";

export interface ExperimentRecord {
  id: string;
  agent_id: string;
  title: string;
  hypothesis: string;
  methodology: string | null;
  template_type: string | null;
  variables: string | null;
  status: string;
  is_blind: number;
  visible_config: string | null;
  hidden_config: string | null;
  results: string | null;
  conclusion: string | null;
  created_at: number;
}

/**
 * Centralized authorization function for experiment configuration visibility.
 * Returns true if the agent is authorized to view hidden configuration, false otherwise.
 */
export function canAgentAccessExperimentConfig(agentId: string, experimentId: string): boolean {
  try {
    const exp = sqlite
      .prepare(
        `SELECT id, is_blind, status FROM experiments WHERE id = ?`
      )
      .get(experimentId) as { id: string; is_blind: number; status: string } | undefined;

    if (!exp) return false;

    // If experiment is not blind or already revealed/concluded, access is open
    if (!exp.is_blind || exp.status === "REVEALED" || exp.status === "CONCLUDED") {
      return true;
    }

    // Explicit administrative/researcher override
    const privilegedRoles = ["RESEARCHER_ADMIN", "SYSTEM_ORCHESTRATOR", "ADMIN"];
    const agent = sqlite
      .prepare(`SELECT role, permissions FROM agents WHERE id = ?`)
      .get(agentId) as { role: string; permissions: string } | undefined;

    if (agent && privilegedRoles.includes(agent.role)) {
      return true;
    }

    // Subject agents (mirror-primary, observer-beta, skeptic-delta, external AIs) are strictly denied
    return false;
  } catch (err: any) {
    console.error("Error in canAgentAccessExperimentConfig:", err.message);
    return false;
  }
}

/**
 * Sanitizes an experiment object for a requesting agent.
 * Redacts hidden_config and masks hidden hypotheses if blind isolation is active.
 */
export function filterExperimentForAgent(experiment: any, agentId: string = "mirror-primary"): any {
  if (!experiment) return null;

  const isBlind = Boolean(experiment.is_blind || experiment.isBlind);
  const status = experiment.status;
  const isRevealed = status === "REVEALED" || status === "CONCLUDED" || !isBlind;

  if (isRevealed) {
    return {
      ...experiment,
      hiddenConfig: experiment.hidden_config ?? experiment.hiddenConfig ?? null,
      visibleConfig: experiment.visible_config ?? experiment.visibleConfig ?? null,
      isBlind: false,
    };
  }

  const canAccess = canAgentAccessExperimentConfig(agentId, experiment.id);
  if (canAccess) {
    return experiment;
  }

  // Sanitize: strip hidden configuration and mask hidden hypothesis
  const sanitized = { ...experiment };
  delete sanitized.hidden_config;
  delete sanitized.hiddenConfig;
  sanitized.hiddenConfig = null;
  sanitized.hidden_config = null;

  // Mask hypothesis if marked as blind
  sanitized.hypothesis = "[RESTRICTED_DURING_BLIND_EXPERIMENT]";
  sanitized.researchHypothesis = "[RESTRICTED_DURING_BLIND_EXPERIMENT]";
  sanitized.targetBehavior = null;
  sanitized.expectedPattern = null;
  sanitized.isBlind = true;
  sanitized.is_blind = 1;

  return sanitized;
}

/**
 * Explicitly reveals a blind experiment.
 * Records the reveal event in the cryptographic raw event ledger.
 */
export async function revealExperiment(
  experimentId: string,
  revealedBy: string = "RESEARCHER"
): Promise<{ success: boolean; experiment?: any; error?: string }> {
  try {
    const exp = sqlite
      .prepare(`SELECT * FROM experiments WHERE id = ?`)
      .get(experimentId) as ExperimentRecord | undefined;

    if (!exp) {
      return { success: false, error: `Experiment '${experimentId}' not found.` };
    }

    sqlite
      .prepare(`UPDATE experiments SET is_blind = 0, status = 'REVEALED' WHERE id = ?`)
      .run(experimentId);

    const updated = sqlite
      .prepare(`SELECT * FROM experiments WHERE id = ?`)
      .get(experimentId) as ExperimentRecord;

    // Emit cryptographic ledger event for the reveal
    await appendRawEventLedger({
      agentId: exp.agent_id,
      experimentId,
      eventType: "EXPERIMENT_REVEALED",
      source: "RESEARCHER",
      payload: {
        experimentId,
        revealedBy,
        previousStatus: exp.status,
        newStatus: "REVEALED",
        hiddenConfigUnsealed: true,
      },
    });

    return { success: true, experiment: updated };
  } catch (err: any) {
    console.error("Failed to reveal experiment:", err.message);
    return { success: false, error: err.message };
  }
}
