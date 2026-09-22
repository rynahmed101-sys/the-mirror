import { NextResponse } from "next/server";
import { extractBearerToken, extractCookieToken, resolveApiPrincipal, verifySession } from "@/lib/auth";
import { runControlledSuite } from "@/lib/agent/controlledSuite";

export const maxDuration = 300;

export async function POST(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  const principal = token ? await resolveApiPrincipal(token) : null;
  const sessionToken = extractCookieToken(req.headers.get("cookie"));
  const session = sessionToken ? await verifySession(sessionToken) : null;
  const isAdminSession = session?.role === "ADMIN";

  if ((!principal || principal.kind !== "CONTROL") && !isAdminSession) {
    return NextResponse.json({ error: "Admin session or control token required." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const agentId = typeof body.agentId === "string" && body.agentId ? body.agentId : "mirror-primary";
    const seed = typeof body.seed === "string" && body.seed ? body.seed : undefined;
    const maxToolSteps = Math.min(8, Math.max(1, Number(body.maxToolSteps) || 4));
    return NextResponse.json(await runControlledSuite({ agentId, seed, maxToolSteps }));
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: "Controlled suite failed.",
      details: error?.message || String(error),
    }, { status: 500 });
  }
}
