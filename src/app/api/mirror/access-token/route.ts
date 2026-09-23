import { NextResponse } from "next/server";
import { resolveRequestPrincipal, revokeApiToken } from "@/lib/auth";

async function requireControl(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  return principal?.kind === "CONTROL";
}

export async function POST(req: Request) {
  if (!(await requireControl(req))) {
    return NextResponse.json({ error: "Legacy token issuance is disabled. Create a link capability at /api/mirror/access-link." }, { status: 410 });
  }
  return NextResponse.json({ error: "Legacy token issuance is disabled. Create a link capability at /api/mirror/access-link." }, { status: 410 });
}

export async function DELETE(req: Request) {
  if (!(await requireControl(req))) {
    return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Token id required." }, { status: 400 });
  try {
    return NextResponse.json({ success: true, ...(await revokeApiToken(id)) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
