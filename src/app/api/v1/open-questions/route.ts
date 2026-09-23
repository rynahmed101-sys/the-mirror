import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { sql, eq } from "drizzle-orm";

const tables:any = isPg ? pgSchema : sqliteSchema;
const { openQuestions } = tables;

export async function GET(req:Request) {
  try {
    const url = new URL(req.url);
    const actor = await requireExperimentalActor(req, url.searchParams.get("agentId"));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const list = await db.select().from(openQuestions).where(eq(openQuestions.agentId, actor.agentId)).orderBy(sql`${openQuestions.createdAt} DESC`).limit(limit);
    return NextResponse.json(list.map((q:any) => ({ ...q, evidenceRefs:q.evidenceRefs ? JSON.parse(q.evidenceRefs) : [] })));
  } catch (error:any) {
    const message = error?.message || String(error);
    return NextResponse.json({ error:message }, { status:message === "Unauthorized" ? 401 : 403 });
  }
}

export async function POST(req:Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const actor = await requireExperimentalActor(req, typeof body.agentId === "string" ? body.agentId : null);
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return NextResponse.json({ error:"Question statement required" }, { status:400 });
    const evidenceRefs = Array.isArray(body.evidenceRefs) ? body.evidenceRefs.filter((x:unknown) => typeof x === "string") : [];
    const [row] = await db.insert(openQuestions).values({
      agentId:actor.agentId,
      question,
      category:typeof body.category === "string" && body.category ? body.category : "METACOGNITION",
      status:"OPEN",
      evidenceRefs:evidenceRefs.length ? JSON.stringify(evidenceRefs) : null,
    }).returning();
    return NextResponse.json({ success:true, question:row });
  } catch(error:any) {
    const message=error?.message || String(error);
    return NextResponse.json({ error:message }, { status:message === "Unauthorized" ? 401 : 403 });
  }
}