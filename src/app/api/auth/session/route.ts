import { NextResponse } from "next/server";
import { extractCookieToken, verifyAdminSession } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await verifyAdminSession(extractCookieToken(req.headers.get("cookie")));
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, role: "ADMIN" });
}
