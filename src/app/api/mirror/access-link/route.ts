import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { createMirrorAccessLink, revokeMirrorAccessLink } from "@/lib/agent/accessLinks";

export const runtime = "nodejs";

async function requireControl(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  return principal?.kind === "CONTROL";
}

export async function POST(req: Request) {
  if (!(await requireControl(req))) return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const result = await createMirrorAccessLink({
      origin: new URL(req.url).origin,
      agentId: typeof body.agentId === "string" && body.agentId ? body.agentId : "agent_external_link",
      label: typeof body.label === "string" ? body.label : "Mirror external laboratory",
      ttlHours: Number(body.ttlHours) || 24,
    });
    return NextResponse.json({ success: true, capability: result, transport: "link_capability" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await requireControl(req))) return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Access-link id required." }, { status: 400 });
  return NextResponse.json({ success: true, revoked: await revokeMirrorAccessLink(id) });
}
