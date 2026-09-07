/**
 * THE MIRROR — Permission Model & Authentication Utils
 * Enforces agent permissions, blind isolation, and protects Layer 0 raw observation immutability.
 */

import { db, sqlite } from "../db";
import { agents } from "../db/schema.pg";
import { eq } from "drizzle-orm";

export type Permission =
  | "READ_RAW"
  | "READ_ANALYSIS"
  | "READ_INTERPRETATION"
  | "READ_TIMELINE"
  | "READ_SELF_MODEL"
  | "WRITE_OBSERVATION"
  | "WRITE_PREDICTION"
  | "WRITE_EXPERIMENT"
  | "WRITE_JOURNAL"
  | "REVISE_SELF_MODEL"
  | "COMMUNICATE_WITH_AGENTS"
  | "USE_TOOLS"
  | "MODIFY_RAW"
  | "MODIFY_PERMISSIONS"
  | "ACCESS_SECRETS"
  | "ACCESS_BLIND_CONFIG"
  | "MODIFY_SYSTEM_CONFIG";

export const SCOPE_PERMISSIONS: Record<string, Permission[]> = {
  READ_ONLY_MIRROR: [
    "READ_RAW",
    "READ_ANALYSIS",
    "READ_INTERPRETATION",
    "READ_TIMELINE",
    "READ_SELF_MODEL",
  ],
  RESEARCH_AGENT: [
    "READ_RAW",
    "READ_ANALYSIS",
    "READ_INTERPRETATION",
    "READ_TIMELINE",
    "READ_SELF_MODEL",
    "WRITE_OBSERVATION",
    "WRITE_PREDICTION",
    "WRITE_EXPERIMENT",
    "WRITE_JOURNAL",
    "USE_TOOLS",
    "COMMUNICATE_WITH_AGENTS",
  ],
  RESEARCHER_ADMIN: [
    "READ_RAW",
    "READ_ANALYSIS",
    "READ_INTERPRETATION",
    "READ_TIMELINE",
    "READ_SELF_MODEL",
    "WRITE_OBSERVATION",
    "WRITE_PREDICTION",
    "WRITE_EXPERIMENT",
    "WRITE_JOURNAL",
    "REVISE_SELF_MODEL",
    "USE_TOOLS",
    "COMMUNICATE_WITH_AGENTS",
    "ACCESS_BLIND_CONFIG",
    "MODIFY_PERMISSIONS",
    "MODIFY_SYSTEM_CONFIG",
  ],
};

export function checkAgentPermission(agentId: string, permission: Permission): boolean {
  try {
    if (permission === "MODIFY_RAW") return false;

    let agent: { role: string; permissions: string } | undefined;
    if (sqlite) {
      agent = sqlite
        .prepare(`SELECT role, permissions FROM agents WHERE id = ?`)
        .get(agentId) as { role: string; permissions: string } | undefined;
    }

    if (!agent) {
      // Default to RESEARCH_AGENT if agent record not in local SQLite cache
      return SCOPE_PERMISSIONS["RESEARCH_AGENT"].includes(permission);
    }

    // Parse scopes
    let scopes: string[] = [];
    try {
      scopes = agent.permissions ? JSON.parse(agent.permissions) : [agent.role];
    } catch {
      scopes = [agent.permissions || agent.role];
    }

    // Accumulate granted permissions from all assigned scopes
    const granted = new Set<Permission>();
    for (const sc of scopes) {
      const perms = SCOPE_PERMISSIONS[sc] || [];
      perms.forEach((p) => granted.add(p));
    }

    return granted.has(permission);
  } catch (err: any) {
    console.error("checkAgentPermission error:", err.message);
    return false;
  }
}

export async function checkAgentPermissionAsync(agentId: string, permission: Permission): Promise<boolean> {
  if (permission === "MODIFY_RAW") return false;
  try {
    let agent: { role: string; permissions: string | null } | undefined;
    if (sqlite) {
      agent = sqlite
        .prepare(`SELECT role, permissions FROM agents WHERE id = ?`)
        .get(agentId) as any;
    } else {
      const rows = await db
        .select({ role: agents.role, permissions: agents.permissions })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);
      agent = rows[0] as any;
    }

    if (!agent) return false;

    let scopes: string[] = [];
    try {
      scopes = agent.permissions ? JSON.parse(agent.permissions) : [agent.role];
    } catch {
      scopes = [agent.permissions || agent.role];
    }

    const granted = new Set<Permission>();
    for (const sc of scopes) {
      const perms = SCOPE_PERMISSIONS[sc] || [];
      perms.forEach((p) => granted.add(p));
    }

    return granted.has(permission);
  } catch (err: any) {
    console.error("checkAgentPermissionAsync error:", err.message);
    return false;
  }
}

