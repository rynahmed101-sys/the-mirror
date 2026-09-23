import { eq } from "drizzle-orm";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { appendRawEventLedger } from "@/lib/agent/eventLedger";
import { LUNA_EXTERNAL_AGENT } from "./lunaExternalAgent";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { agents } = tables;

export async function ensureLunaExternalAgent() {
  const existing = await db
    .select({ id: agents.id, provider: agents.provider, model: agents.model, status: agents.status })
    .from(agents)
    .where(eq(agents.id, LUNA_EXTERNAL_AGENT.id))
    .limit(1);

  if (existing.length) return existing[0];

  const [agent] = await db
    .insert(agents)
    .values({
      id: LUNA_EXTERNAL_AGENT.id,
      name: LUNA_EXTERNAL_AGENT.name,
      displayName: LUNA_EXTERNAL_AGENT.displayName,
      type: LUNA_EXTERNAL_AGENT.type,
      role: LUNA_EXTERNAL_AGENT.role,
      provider: LUNA_EXTERNAL_AGENT.provider,
      model: LUNA_EXTERNAL_AGENT.model,
      permissions: JSON.stringify(LUNA_EXTERNAL_AGENT.permissions),
      status: "ACTIVE",
      isActive: true,
      lastSeenAt: new Date(),
    })
    .returning();

  await appendRawEventLedger({
    agentId: LUNA_EXTERNAL_AGENT.id,
    eventType: "EXTERNAL_AGENT_REGISTERED",
    source: "SYSTEM",
    payload: {
      agentId: LUNA_EXTERNAL_AGENT.id,
      name: LUNA_EXTERNAL_AGENT.name,
      provider: LUNA_EXTERNAL_AGENT.provider,
      model: LUNA_EXTERNAL_AGENT.model,
      permissions: LUNA_EXTERNAL_AGENT.permissions,
      registrationMode: "IDEMPOTENT_BOOTSTRAP",
    },
  });

  return agent;
}
