import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { runSupabaseConnectivityTest } from "@/lib/db/supabaseMirror";

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") {
    return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });
  }

  return NextResponse.json(await runSupabaseConnectivityTest());
}
