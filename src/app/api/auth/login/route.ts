import { NextResponse } from "next/server";
import { signSession, verifyAdminPassword } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";

    if (!password || !(await verifyAdminPassword(password))) {
      return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
    }

    const token = await signSession({ role: "ADMIN", authMethod: "ADMIN_PASSWORD" });
    const res = NextResponse.json({ success: true, role: "ADMIN" });

    res.cookies.set("mirror_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Authentication failed." }, { status: 500 });
  }
}
