import { NextResponse } from "next/server";

export async function GET() {
  const now = new Date();
  return NextResponse.json({
    iso: now.toISOString(),
    unixTimestamp: Math.floor(now.getTime() / 1000),
    localTime: now.toString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    uptimeSeconds: process.uptime(),
  });
}
