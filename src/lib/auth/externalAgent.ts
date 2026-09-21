import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentApiKeys, agents } from "@/lib/db/schema.pg";

export type AuthenticatedExternalAgent = {
  id: string;
  name: string;
  permissions: string[];
};

export async function authenticateExternalAgent(req: Request): Promise<AuthenticatedExternalAgent | null> {
  const header = req.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const [candidate] = await db.select({
    agentId: agentApiKeys.agentId,
    apiKeyHash: agentApiKeys.apiKeyHash,
  }).from(agentApiKeys).where(eq(agentApiKeys.keyPrefix, match[1].slice(0, 14))).limit(10);

  if (!candidate || !(await bcrypt.compare(match[1], candidate.apiKeyHash))) return null;

  const [agent] = await db.select({
    id: agents.id,
    name: agents.name,
    permissions: agents.permissions,
  }).from(agents).where(eq(agents.id, candidate.agentId)).limit(1);
  if (!agent || !agent.permissions) return null;

  let permissions: string[];
  try {
    permissions = JSON.parse(agent.permissions);
  } catch {
    permissions = [agent.permissions];
  }
  if (!permissions.includes("FULL_ACCESS")) return null;
  return { ...agent, permissions };
}
