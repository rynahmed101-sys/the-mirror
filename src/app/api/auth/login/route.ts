import { NextResponse } from "next/server";
import { getAdminUsername, signSession, verifyAdminCredentials } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!(await verifyAdminCredentials(username, password))) {
    return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
  }

  const token = await signSession({
    sub: "admin",
    role: "ADMIN",
    username: getAdminUsername(),
    authMethod: "ADMIN_PASSWORD",
  });

  const response = NextResponse.json({ success: true, username: getAdminUsername(), role: "ADMIN" });
  response.cookies.set({
    name: "mirror_session",
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
