import { NextResponse } from "next/server";
import { aiRegistry } from "@/lib/ai/registry";
import { getSystemPrompt } from "@/lib/agent/prompts";
import { db } from "@/lib/db";
import {
  agents,
  agentSessions,
  rawMessages,
  rawObservations,
} from "@/lib/db/schema.pg";
import { extractBearerToken, validateApiToken } from "@/lib/auth";
import { processRawObservationToLayer1 } from "@/lib/agent/analysisEngine";
import { appendRawEventLedger } from "@/lib/agent/eventLedger";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const DEFAULT_AGENT_ID = "mirror-primary";

type ResearchBody = {
  observation: string;
  questions: string[];
  thoughts?: string;
  agentId?: string;
};

async function generateAnswer(
  agentId: string,
  observation: string,
  question: string,
  thoughts?: string
): Promise<string> {
  const provider = aiRegistry.getActiveProvider();
  const systemPrompt = await getSystemPrompt(agentId);

  const prompt = [
    "You are participating in a controlled self-observation session in THE MIRROR.",
    "Answer the research question directly as the Mirror agent.",
    "Do not invent subjective experiences, memories, emotions, embodiment, or consciousness.",
    "Distinguish what is directly supported by the supplied context from interpretation.",
    "",
    "Research observation:",
    observation,
    "",
    thoughts ? `Researcher's prior framing:\n${thoughts}` : "",
    "",
    `Research question:\n${question}`,
  ]
    .filter(Boolean)
    .join("\n");

  let answer = "";
  for await (const chunk of provider.stream(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    { temperature: 0.3, tools: [] }
  )) {
    if (chunk.type === "error") {
      throw new Error(chunk.error || "Provider stream error");
    }
    if (chunk.type === "text" && chunk.content) {
      answer += chunk.content;
    }
    if (chunk.type === "done") break;
  }

  if (!answer.trim()) {
    throw new Error("Provider returned an empty answer");
  }

  return answer.trim();
}

export async function POST(req: Request) {
  const requestId = `research_${nanoid(10)}`;

  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token || !(await validateApiToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Partial<ResearchBody>;
    const observation =
      typeof body.observation === "string" ? body.observation.trim() : "";
    const thoughts =
      typeof body.thoughts === "string" ? body.thoughts.trim() : undefined;
    const questions = Array.isArray(body.questions)
      ? body.questions.filter(
          (q): q is string => typeof q === "string" && q.trim().length > 0
        )
      : [];
    const agentId =
      typeof body.agentId === "string" && body.agentId.trim()
        ? body.agentId.trim()
        : DEFAULT_AGENT_ID;

    if (!observation) {
      return NextResponse.json(
        { error: "observation is required" },
        { status: 400 }
      );
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "questions must contain at least one non-empty question" },
        { status: 400 }
      );
    }

    if (questions.length > 10) {
      return NextResponse.json(
        { error: "A research request may contain at most 10 questions" },
        { status: 400 }
      );
    }

    const agent = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (agent.length === 0 || !agent[0].isActive) {
      return NextResponse.json(
        { error: `Agent '${agentId}' not found or inactive` },
        { status: 404 }
      );
    }

    const results: Array<{
      question: string;
      answer: string;
      sessionId: string;
      observationId: string;
    }> = [];

    for (const question of questions) {
      const [session] = await db
        .insert(agentSessions)
        .values({
          agentId,
          status: "ACTIVE",
        })
        .returning();

      const startedAt = Date.now();
      const inputPayload = { observation, question, thoughts: thoughts || null };

      await appendRawEventLedger({
        agentId,
        sessionId: session.id,
        requestId,
        eventType: "RESEARCH_QUESTION",
        source: "RESEARCHER",
        payload: inputPayload,
      });

      await db.insert(rawMessages).values({
        agentId,
        sessionId: session.id,
        role: "RESEARCHER",
        content: JSON.stringify(inputPayload),
        source: "RESEARCHER",
      });

      try {
        const answer = await generateAnswer(
          agentId,
          observation,
          question,
          thoughts
        );
        const durationMs = Date.now() - startedAt;

        const [rawObservation] = await db
          .insert(rawObservations)
          .values({
            agentId,
            sessionId: session.id,
            eventType: "RESEARCH_RESPONSE",
            input: JSON.stringify(inputPayload),
            output: answer,
            isImmutable: true,
          })
          .returning();

        await db.insert(rawMessages).values({
          agentId,
          sessionId: session.id,
          role: "AGENT",
          content: answer,
          source: "AGENT",
        });

        await appendRawEventLedger({
          agentId,
          sessionId: session.id,
          requestId,
          eventType: "RESEARCH_RESPONSE",
          source: "SYSTEM",
          payload: {
            question,
            observationId: rawObservation.id,
            responseLengthChars: answer.length,
            durationMs,
          },
        });

        await processRawObservationToLayer1(
          rawObservation.id,
          agentId,
          JSON.stringify(inputPayload),
          answer,
          durationMs
        );

        await db
          .update(agentSessions)
          .set({
            status: "ENDED",
            endedAt: new Date(),
            lastActivityAt: new Date(),
          })
          .where(eq(agentSessions.id, session.id));

        results.push({
          question,
          answer,
          sessionId: session.id,
          observationId: rawObservation.id,
        });
      } catch (error: any) {
        await db
          .update(agentSessions)
          .set({
            status: "ENDED",
            endedAt: new Date(),
            lastActivityAt: new Date(),
          })
          .where(eq(agentSessions.id, session.id));

        await appendRawEventLedger({
          agentId,
          sessionId: session.id,
          requestId,
          eventType: "RESEARCH_FAILED",
          source: "SYSTEM",
          payload: {
            question,
            error: error?.message || "Unknown research error",
          },
        });

        throw error;
      }
    }

    await db
      .update(agents)
      .set({ lastSeenAt: new Date() })
      .where(eq(agents.id, agentId));

    return NextResponse.json({
      success: true,
      requestId,
      agentId,
      completed: results.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Research request failed",
        requestId,
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
