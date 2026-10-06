import { NextResponse } from "next/server";
import {
  VerificationExperimentRequest,
  VerificationExperimentResult,
} from "@/lib/verification/verificationContract";

export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const expected = process.env.MIRROR_VERIFICATION_JOB_TOKEN;
  if (!expected) return false;
  return req.headers.get("authorization") === "Bearer " + expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Verification experiment endpoint is disabled or unauthorized." }, { status: 403 });
  }
  const adapterUrl = (process.env.MIRROR_VERIFICATION_ADAPTER_URL || "").trim();
  if (!adapterUrl) {
    return NextResponse.json({ error: "Bounded laboratory adapter is not configured." }, { status: 503 });
  }
  try {
    const input = VerificationExperimentRequest.parse(await req.json());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.budget.max_runtime_ms);
    try {
      const response = await fetch(adapterUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer " + (process.env.MIRROR_VERIFICATION_ADAPTER_TOKEN || ""),
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("laboratory adapter returned HTTP " + response.status);
      const payload = VerificationExperimentResult.parse(await response.json());
      if (payload.request_id !== input.request_id || payload.source_revision !== input.source_revision) {
        throw new Error("laboratory result is not bound to the requested identity");
      }
      return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
    } finally {
      clearTimeout(timer);
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 400 });
  }
}
