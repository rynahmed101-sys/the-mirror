import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import MirrorWorkspace from "@/components/MirrorWorkspace";
import { extractCookieToken, verifyAdminSession } from "@/lib/auth";
import { ensureLunaExternalAgent } from "@/lib/auth/ensureLunaExternalAgent";

export default async function Home() {
  const cookieStore = await cookies();
  const session = await verifyAdminSession(extractCookieToken(cookieStore.toString()));
  if (!session) redirect("/admin");
  await ensureLunaExternalAgent();
  return <MirrorWorkspace />;
}
