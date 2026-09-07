import { NextResponse } from "next/server";
import { aiRegistry } from "@/lib/ai/registry";
import { executeTool } from "@/lib/agent/executor";
import { getSystemPrompt } from "@/lib/agent/prompts";
import { db } from "@/lib/db";
import { systemConfig, timelineEvents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const { agentId = "mirror-primary", objective = "Perform routine self-observation and check self-model claims against latest activity." } = await req.json();

    const provider = aiRegistry.getActiveProvider();
    const systemPrompt = await getSystemPrompt(agentId);

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `AUTONOMOUS EXECUTION TURN:\n\nObjective: ${objective}\n\nReview your internal state using environment tools. Record any new observations, test predictions, or revise claims if needed. If no action is required, summarize your current epistemic state.`,
      },
    ];

    const response = await provider.complete(messages as any, { temperature: 0.2 });

    // Check for tool calls
    const outputText = response.content || "";
    const toolCallMatch = outputText.match(/```json\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/);
    let toolResult = null;
    if (toolCallMatch) {
      try {
        const toolReq = JSON.parse(toolCallMatch[1]);
        if (toolReq.tool && toolReq.arguments) {
          toolResult = await executeTool(toolReq.tool, toolReq.arguments, agentId);
        }
      } catch {
        // ignore
      }
    }

    // Increment cycle counter
    await db
      .update(systemConfig)
      .set({ totalAgentCycles: sql`${systemConfig.totalAgentCycles} + 1` });

    await db.insert(timelineEvents).values({
      eventType: "AGENT_CYCLE_COMPLETED",
      title: `Autonomous Turn: ${agentId}`,
      description: outputText.slice(0, 150) + "...",
      agentId,
      metadata: JSON.stringify({ objective, toolExecuted: !!toolResult }),
    });

    return NextResponse.json({
      success: true,
      agentId,
      output: outputText,
      toolResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Autonomous step failed", details: error.message },
      { status: 500 }
    );
  }
}
