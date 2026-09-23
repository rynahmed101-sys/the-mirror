import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { eq } from "drizzle-orm";
import { resolveRequestPrincipal } from "@/lib/auth";

export const runtime = "nodejs";

const tables:any = isPg ? pgSchema : sqliteSchema;
const { agents } = tables;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") {
    return NextResponse.json({ error: "Admin control credential required." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const blocked = body.blocked !== false;

  try {
    const [agent] = await db.update(agents).set({
      isActive: !blocked,
      status: blocked ? "INACTIVE" : "ACTIVE",
      lastSeenAt: blocked ? undefined : new Date(),
    }).where(eq(agents.id, id)).returning();

    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        isActive: agent.isActive,
      },
    });
  } catch (error:any) {
    return NextResponse.json({ error: "Failed to update agent.", details: error?.message || String(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return PATCH(req, { params });
}
