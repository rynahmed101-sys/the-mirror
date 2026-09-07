import { NextResponse } from "next/server";
import { aiRegistry } from "@/lib/ai/registry";
import { executeTool } from "@/lib/agent/executor";
import { getSystemPrompt } from "@/lib/agent/prompts";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { db } from "@/lib/db";
import { systemConfig, timelineEvents, agentInteractions } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const { messages, agentId = "mirror-primary", maxToolSteps = 5 } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages array required" }, { status: 400 });
    }

    const provider = aiRegistry.getActiveProvider();
    const systemPrompt = await getSystemPrompt(agentId);

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Increment agent cycle counter
    const configs = await db.select().from(systemConfig).limit(1);
    if (configs.length > 0) {
      await db
        .update(systemConfig)
        .set({
          totalAgentCycles: sql`${systemConfig.totalAgentCycles} + 1`,
        });
    }

    // Set up SSE response stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: any) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          sendEvent("status", { message: "Connecting to AI model...", agentId });

          let currentMessages = [...fullMessages];
          let toolStep = 0;
          let continueLoop = true;

          while (continueLoop && toolStep < maxToolSteps) {
            toolStep++;
            let accumulatedContent = "";

            // Call provider stream — chunk is StreamChunk { type, content?, error? }
            const textStream = provider.stream(currentMessages, {
              temperature: 0.3,
              tools: AGENT_TOOLS,
            });

            for await (const chunk of textStream) {
              if (chunk.type === "error") {
                sendEvent("error", { message: chunk.error || "Provider stream error" });
                continueLoop = false;
                break;
              }
              if (chunk.type === "done") break;
              if (chunk.type === "text" && chunk.content) {
                accumulatedContent += chunk.content;
                sendEvent("delta", { content: chunk.content });
              }
            }

            // Check if AI requested tool calls (JSON pattern or standard format)
            const toolCallMatch = accumulatedContent.match(/```json\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/);
            if (toolCallMatch) {
              try {
                const toolReq = JSON.parse(toolCallMatch[1]);
                if (toolReq.tool && toolReq.arguments) {
                  sendEvent("tool_call", {
                    tool: toolReq.tool,
                    args: toolReq.arguments,
                    step: toolStep,
                  });

                  // Execute tool
                  const toolResult = await executeTool(toolReq.tool, toolReq.arguments, agentId);

                  sendEvent("tool_result", {
                    tool: toolReq.tool,
                    result: toolResult,
                    step: toolStep,
                  });

                  // Append tool interaction to context and continue turn
                  currentMessages.push({ role: "assistant", content: accumulatedContent });
                  currentMessages.push({
                    role: "user",
                    content: `[TOOL_RESULT for ${toolReq.tool}]: ${JSON.stringify(toolResult)}`,
                  });
                  continue;
                }
              } catch (e) {
                // Not a valid tool call, treat as final text
              }
            }

            // If no tool call, complete turn
            continueLoop = false;
          }

          sendEvent("done", { message: "Execution finished", steps: toolStep });
          controller.close();
        } catch (err: any) {
          sendEvent("error", { message: err.message || "Streaming failed" });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Agent chat failed", details: error.message },
      { status: 500 }
    );
  }
}
