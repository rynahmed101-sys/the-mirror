import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import MirrorDashboard from "@/components/MirrorDashboard";
import { extractCookieToken, verifyAdminSession } from "@/lib/auth";

export default async function Home() {
  const cookieStore = await cookies();
  const session = await verifyAdminSession(
    extractCookieToken(cookieStore.toString())
  );

  if (!session) redirect("/admin");
  return <MirrorDashboard />;
}
