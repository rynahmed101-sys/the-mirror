import { NextResponse } from "next/server";
import { extractBearerToken, resolveApiPrincipal } from "@/lib/auth";
import { runAutopilot } from "@/lib/agent/autopilot";
import { constrainAgentId } from "@/lib/auth/agentScope";

/** One bounded autonomous cycle. Use /api/mirror/bot for multi-cycle runs. */
export async function POST(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  const principal = token ? await resolveApiPrincipal(token) : null;
  if (!principal) return NextResponse.json({ error:"Unauthorized" }, { status:401 });

  try {
    const body = await req.json().catch(() => ({}));
    const requestedAgentId = typeof body.agentId === "string" ? body.agentId : null;
    let agentId: string | undefined;
    try { agentId = constrainAgentId(principal, requestedAgentId) || "mirror-primary"; }
    catch (error:any) { return NextResponse.json({ error: "Forbidden: " + error.message }, { status:403 }); }
    const result = await runAutopilot({
      agentId,
      objective: typeof body.objective === "string" ? body.objective : undefined,
      maxCycles: 1,
      maxToolSteps: body.maxToolSteps,
      requestSource: "AGENT",
    });
    return NextResponse.json({ success:true, ...result });
  } catch (error:any) {
    return NextResponse.json({ error:"Autonomous step failed", details:error?.message || String(error) }, { status:500 });
  }
}