import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { extractCookieToken, verifyAdminSession } from "@/lib/auth";
import ConstellationSurface from "@/components/ConstellationSurface";

export default async function ConstellationPage() {
  const cookieStore = await cookies();
  const session = await verifyAdminSession(extractCookieToken(cookieStore.toString()));
  if (!session) redirect("/admin");
  return <ConstellationSurface />;
}
