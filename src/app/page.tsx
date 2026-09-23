import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import MirrorDashboard from "@/components/MirrorDashboard";
import { extractCookieToken, verifyAdminSession } from "@/lib/auth";
import { ensureLunaExternalAgent } from "@/lib/auth/ensureLunaExternalAgent";

export default async function Home() {
  const cookieStore = await cookies();
  const session = await verifyAdminSession(
    extractCookieToken(cookieStore.toString())
  );

  if (!session) redirect("/admin");
  await ensureLunaExternalAgent();
  return (
    <div className="mirror-app relative">
      <Link
        href="/agent"
        className="fixed bottom-5 right-5 z-[80] inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-[#071015]/95 px-4 py-2.5 text-xs font-semibold text-cyan-100 shadow-2xl backdrop-blur-xl transition hover:border-cyan-400/40 hover:bg-[#0b1a20]"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,.7)]" />
        Talk to Ollama
      </Link>
      <MirrorDashboard />
    </div>
  );
}
