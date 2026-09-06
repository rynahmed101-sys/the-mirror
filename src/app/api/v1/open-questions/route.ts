import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { openQuestions } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const list = await db
      .select()
      .from(openQuestions)
      .orderBy(sql`${openQuestions.createdAt} DESC`);

    return NextResponse.json(
      list.map((q) => ({
        ...q,
        evidenceRefs: q.evidenceRefs ? JSON.parse(q.evidenceRefs) : [],
      }))
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { question, category, agentId, evidenceRefs } = body;

    if (!question) {
      return NextResponse.json({ error: "Question statement required" }, { status: 400 });
    }

    const [q] = await db
      .insert(openQuestions)
      .values({
        agentId: agentId || "mirror-primary",
        question,
        category: category || "METACOGNITION",
        status: "OPEN",
        evidenceRefs: evidenceRefs ? JSON.stringify(evidenceRefs) : null,
      })
      .returning();

    return NextResponse.json({ success: true, question: q });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
