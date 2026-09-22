import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SimulationChamber from "@/components/SimulationChamber";
import { extractCookieToken, verifyAdminSession } from "@/lib/auth";

export default async function SimulationPage() {
  const cookieStore = await cookies();
  const session = await verifyAdminSession(extractCookieToken(cookieStore.toString()));
  if (!session) redirect("/admin");
  return <SimulationChamber />;
}
