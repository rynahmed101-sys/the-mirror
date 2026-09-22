import { db, isPg } from "./../db";
import * as sqliteSchema from "../db/schema";
import * as pgSchema from "../db/schema.pg";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { ApiPrincipal } from "./index";
import { resolveExternalActor } from "./externalActor";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { agents } = tables;

export type ExperimentalActor = {
  agentId: string;
  mode: "AGENT" | "TEMP_EXTERNAL" | "CONTROL";
};

export async function requireExperimentalActor(req: Request, requestedAgentId?: string | null): Promise<ExperimentalActor> {
  const { resolveRequestPrincipal } = await import("./index");
  const principal = await resolveRequestPrincipal(req);
  if (!principal) throw new Error("Unauthorized");

  const resolved = resolveExternalActor(principal, requestedAgentId);
  if (resolved.mode === "TEMP_EXTERNAL") {
    await ensureGuestAgent(resolved.agentId);
  }
  return { agentId: resolved.agentId, mode: resolved.mode === "TEMP_EXTERNAL" ? "TEMP_EXTERNAL" : principal.kind === "CONTROL" ? "CONTROL" : "AGENT" };
}

export async function ensureGuestAgent(agentId: string) {
  const existing = await db.select({ id: agents.id, isActive: agents.isActive }).from(agents).where(eq(agents.id, agentId)).limit(1);
  if (existing.length) {
    if (existing[0].isActive === false) throw new Error("External guest agent is blocked.");
    return;
  }

  try {
    await db.insert(agents).values({
      id: agentId,
      name: "Temporary External AI",
      displayName: "Temporary External AI",
      type: "TEMP_EXTERNAL",
      role: "EXTERNAL_AGENT",
      provider: "external",
      model: "temporary-guest",
      permissions: JSON.stringify(["RESEARCH_AGENT"]),
      status: "ACTIVE",
      isActive: true,
      lastSeenAt: new Date(),
      ...(isPg ? {} : {}),
    }).returning();
  } catch {
    const retry = await db.select({ id: agents.id, isActive: agents.isActive }).from(agents).where(eq(agents.id, agentId)).limit(1);
    if (!retry.length) throw new Error("Failed to initialize temporary external agent.");
    if (retry[0].isActive === false) throw new Error("External guest agent is blocked.");
  }
}
