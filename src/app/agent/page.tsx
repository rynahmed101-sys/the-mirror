import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { extractCookieToken, verifyAdminSession } from "@/lib/auth";
import { ensureLunaExternalAgent } from "@/lib/auth/ensureLunaExternalAgent";
import MirrorResearchChat from "@/components/MirrorResearchChat";

export default async function AgentPage() {
  const cookieStore = await cookies();
  const session = await verifyAdminSession(extractCookieToken(cookieStore.toString()));
  if (!session) redirect("/admin");

  await ensureLunaExternalAgent();
  return <MirrorResearchChat />;
}
