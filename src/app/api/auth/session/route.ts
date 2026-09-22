import { NextResponse } from "next/server";
import { extractCookieToken, verifySession } from "@/lib/auth";

export async function GET(req: Request) {
  const token = extractCookieToken(req.headers.get("cookie"));
  const session = token ? await verifySession(token) : null;

  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, role: "ADMIN" });
}
