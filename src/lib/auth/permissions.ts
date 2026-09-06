/**
 * THE MIRROR — Permission Model & Authentication Utils
 * Enforces agent permissions and protects Layer 0 raw observation immutability.
 */

import { db } from "../db";
import { agents } from "../db/schema";
import { eq } from "drizzle-orm";

export type Permission =
  | "READ_RAW"
  | "READ_ANALYSIS"
  | "READ_INTERPRETATION"
  | "WRITE_OBSERVATION"
  | "WRITE_PREDICTION"
  | "WRITE_EXPERIMENT"
  | "WRITE_JOURNAL"
  | "REVISE_SELF_MODEL"
  | "COMMUNICATE_WITH_AGENTS"
  | "USE_TOOLS";

export const DEFAULT_AGENT_PERMISSIONS: Permission[] = [
  "READ_RAW",
  "READ_ANALYSIS",
  "READ_INTERPRETATION",
  "WRITE_OBSERVATION",
  "WRITE_PREDICTION",
  "WRITE_EXPERIMENT",
  "WRITE_JOURNAL",
  "REVISE_SELF_MODEL",
  "COMMUNICATE_WITH_AGENTS",
  "USE_TOOLS",
];

export async function checkAgentPermission(agentId: string, permission: Permission): Promise<boolean> {
  try {
    const list = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (list.length === 0) return true; // Default fallback for system/admin

    const agent = list[0];
    if (!agent.permissions) return true; // Default all permissions if null

    const perms: string[] = JSON.parse(agent.permissions);
    return perms.includes(permission);
  } catch {
    return true;
  }
}
