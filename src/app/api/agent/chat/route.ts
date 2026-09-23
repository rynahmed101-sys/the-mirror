import { NextResponse } from "next/server";
import { aiRegistry } from "@/lib/ai/registry";
import { runToolLoop } from "@/lib/agent/autopilot";
import { getSystemPrompt } from "@/lib/agent/prompts";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import type { ChatMessage } from "@/lib/ai/provider";
import { resolveRequestPrincipal } from "@/lib/auth";
import { resolveExternalActor } from "@/lib/auth/externalActor";
import { ensureGuestAgent } from "@/lib/auth/experimentalActor";

export const runtime = "nodejs";
export const maxDuration = 300;
import { sql } from "drizzle-orm";

const tables:any = isPg ? pgSchema : sqliteSchema;
const { systemConfig, rawMessages, rawObservations, timelineEvents } = tables;

export async function POST(req:Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages as ChatMessage[] : null;
    let agentId: string;
    try {
      const actor = resolveExternalActor(principal, typeof body.agentId === "string" ? body.agentId : null);
      agentId = actor.agentId;
      if (actor.mode === "TEMP_EXTERNAL") await ensureGuestAgent(agentId);
    } catch (error:any) { return NextResponse.json({ error:"Forbidden: " + error.message }, { status:403 }); }
    const maxToolSteps = Math.min(8, Math.max(1, Number(body.maxToolSteps) || 5));
    if (!messages) return NextResponse.json({ error:"Messages array required" }, { status:400 });
    const systemPrompt = await getSystemPrompt(agentId);
    const fullMessages:ChatMessage[] = [
      { role:"system", content:systemPrompt },
      { role:"system", content:"FRONT-DOOR EVIDENCE RULE: Treat the supplied conversation as the complete interaction context. Never claim that a tool was called or state was persisted unless a tool result in this turn proves it. Separate direct observations, interpretations, hypotheses, and unresolved claims." },
      ...messages,
    ];
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event:string, data:any) => controller.enqueue(encoder.encode("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n"));
        try {
          send("status",{message:"Running Mirror agent loop",agentId,provider:"ollama",mode:aiRegistry.getActiveProvider().isLocal ? "local" : "cloud"});
          const result = await runToolLoop({ agentId, sessionId:null, messages:fullMessages, maxToolSteps, requestSource:"AGENT", onToolCall: async (call,step) => send("tool_call",{tool:call.name,args:call.arguments,step}), onToolResult: async (call,toolResult,step) => send("tool_result",{tool:call.name,result:toolResult,step}) });
          const userMessage = [...messages].reverse().find((m:any) => m.role === "user");
          if (userMessage && result.output) {
            await db.insert(rawMessages).values([{agentId,role:"USER",content:String(userMessage.content),source:"EXTERNAL"},{agentId,role:"AGENT",content:result.output,source:"AGENT"}]);
            const [rawObs] = await db.insert(rawObservations).values({agentId,eventType:"FRONT_DOOR_INTERACTION",input:String(userMessage.content),output:result.output}).returning();
            await db.insert(timelineEvents).values({eventType:"FRONT_DOOR_INTERACTION",title:"Front-door interaction: " + agentId,description:result.output.slice(0,150) + "...",agentId,metadata:JSON.stringify({inputLength:String(userMessage.content).length,outputLength:result.output.length,toolCalls:result.trace.length,rawObservationId:rawObs?.id || null})});
          }
          const configs = await db.select().from(systemConfig).limit(1);
          if (configs.length) await db.update(systemConfig).set({totalAgentCycles:sql`${systemConfig.totalAgentCycles} + 1`});
          send("delta",{content:result.output});
          send("done",{message:"Execution finished",steps:result.steps,toolCalls:result.trace.length,model:result.activeModel});
          controller.close();
        } catch(error:any) { send("error",{message:error?.message || String(error)}); controller.close(); }
      },
    });
    return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive"}});
  } catch(error:any) { return NextResponse.json({error:"Agent chat failed",details:error?.message || String(error)},{status:500}); }
}
