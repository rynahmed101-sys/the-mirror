import { NextResponse } from "next/server";
import { resolveRequestPrincipal, createApiToken } from "@/lib/auth";

async function requireControl(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  return principal?.kind === "CONTROL";
}

export async function POST(req: Request) {
  if (!(await requireControl(req))) {
    return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : "temporary-lab-access";
    const result = await createApiToken(name);
    return NextResponse.json({
      success: true,
      ...result,
      warning: "Store this token securely and rotate/revoke it after the experiment.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
