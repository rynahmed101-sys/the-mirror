import { isSupabaseMirrorConfigured } from "../db/supabaseMirror";

async function readInternalLabToken() {
  if (!isSupabaseMirrorConfigured) return null;
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(
    url + "/rest/v1/mirror_internal_control?id=eq.1&select=token",
    {
      headers: { apikey: key!, Authorization: "Bearer " + key! },
      cache: "no-store",
    }
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows?.[0]?.token || null;
}

export async function verifyInternalLabRequest(req: Request) {
  const supplied = req.headers.get("x-mirror-internal-token");
  if (!supplied) return false;
  const expected = await readInternalLabToken();
  return Boolean(expected && supplied === expected);
}
