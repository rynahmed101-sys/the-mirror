import { NextResponse } from "next/server";
import { extractCookieToken, getAdminUsername, verifyAdminSession } from "@/lib/auth";

export async function GET(req: Request) {
  const token = extractCookieToken(req.headers.get("cookie"));
  const session = await verifyAdminSession(token);

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    username: typeof session.username === "string" ? session.username : getAdminUsername(),
    role: "RESEARCHER_ADMIN",
  });
}
