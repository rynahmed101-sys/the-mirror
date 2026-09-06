import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentInteractions } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";

export async function GET() {
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
  try {
    const body = await req.json();
    const { action, senderId, receiverId, message, messageType } = body;

    // Action can be: 'SEND_MESSAGE' or 'CREATE_AGENT'
    if (action === "SEND_MESSAGE") {
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
      const { id, name, role, description, systemPromptOverride } = body;

      if (!id || !name || !role) {
        return NextResponse.json({ error: "Agent ID, name, and role required" }, { status: 400 });
      }

      const [newAgent] = await db
        .insert(agents)
        .values({
          id,
          name,
          role,
          description: description || null,
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
