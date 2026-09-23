import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { resolveRequestPrincipal } from "@/lib/auth";
import { sql, eq } from "drizzle-orm";

const tables:any = isPg ? pgSchema : sqliteSchema;
const { agents, agentInteractions } = tables;

export async function GET(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (principal.kind !== "CONTROL") {
    const actorId = principal.kind === "AGENT" ? principal.agentId : "agent_guest_" + principal.tokenId;
    const list = await db.select().from(agents).where(eq(agents.id, actorId));
    return NextResponse.json(list);
  }
  try {
    const list = await db.select().from(agents);
    return NextResponse.json(list);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch agents", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const body = await req.json();
    const { action, senderId, receiverId, message, messageType } = body;

    // Action can be: 'SEND_MESSAGE' or 'CREATE_AGENT'
    if (action === "SEND_MESSAGE") {
      if (principal.kind !== "CONTROL") {
        const actorId = principal.kind === "AGENT" ? principal.agentId : "agent_guest_" + principal.tokenId;
        if (senderId !== actorId) {
          return NextResponse.json({ error: "Agents may only send messages as themselves." }, { status: 403 });
        }
      }
      if (!senderId || !receiverId || !message) {
        return NextResponse.json({ error: "Sender, receiver, and message required" }, { status: 400 });
      }

      const [interaction] = await db
        .insert(agentInteractions)
        .values({
          senderId,
          receiverId,
          message,
          messageType: messageType || "QUERY",
        })
        .returning();

      return NextResponse.json({ success: true, interaction });
    }

    if (action === "CREATE_AGENT") {
      if (principal.kind !== "CONTROL") return NextResponse.json({ error: "Control credential required." }, { status: 403 });
      const { id, name, role, systemPromptOverride } = body;

      if (!id || !name || !role) {
        return NextResponse.json({ error: "Agent ID, name, and role required" }, { status: 400 });
      }

      const [newAgent] = await db
        .insert(agents)
        .values({
          id,
          name,
          role,
          systemPromptOverride: systemPromptOverride || null,
          isActive: true,
        })
        .returning();

      return NextResponse.json({ success: true, agent: newAgent });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to process agent request", details: error.message },
      { status: 500 }
    );
  }
}
