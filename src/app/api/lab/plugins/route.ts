import { NextResponse } from "next/server";
import { listLabPlugins, LAB_WORKFLOW } from "@/lib/lab/plugins";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ workflow: LAB_WORKFLOW, plugins: listLabPlugins() }, { headers: { "Cache-Control": "no-store" } });
}
