import { NextResponse } from "next/server";
import { extractBearerToken, validateApiToken } from "@/lib/auth";
import { runAutopilot } from "@/lib/agent/autopilot";

/** One bounded autonomous cycle. Use /api/mirror/bot for multi-cycle runs. */
export async function POST(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token || !(await validateApiToken(token))) return NextResponse.json({ error:"Unauthorized" }, { status:401 });

  try {
    const body = await req.json().catch(() => ({}));
    const result = await runAutopilot({
      agentId: typeof body.agentId === "string" ? body.agentId : "mirror-primary",
      objective: typeof body.objective === "string" ? body.objective : undefined,
      maxCycles: 1,
      maxToolSteps: body.maxToolSteps,
    });
    return NextResponse.json({ success:true, ...result });
  } catch (error:any) {
    return NextResponse.json({ error:"Autonomous step failed", details:error?.message || String(error) }, { status:500 });
  }
}