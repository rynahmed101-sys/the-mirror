import { NextRequest, NextResponse } from "next/server";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "xwrqctbkhfytrpzeyzjt";
const SUPABASE_URL = (process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`).replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function headers(profile = true) {
  return {
    apikey: SUPABASE_KEY || "",
    Authorization: `Bearer ${SUPABASE_KEY || ""}`,
    ...(profile ? { "Content-Profile": "gt_constellation", "Accept-Profile": "gt_constellation" } : {}),
    "Content-Type": "application/json",
  };
}

async function supabaseRpc(fn: string, body: Record<string, unknown>) {
  if (!SUPABASE_KEY) throw new Error("Supabase server key is not configured.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase RPC ${fn} failed (${response.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

async function supabaseTable(path: string) {
  if (!SUPABASE_KEY) throw new Error("Supabase server key is not configured.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: headers(),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase table query failed (${response.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    const star = request.nextUrl.searchParams.get("star")?.trim() || "";
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 24), 1), 100);
    const semanticLimit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("semanticLimit") || 24), 1), 100);

    if (star) {
      if (star.startsWith("gt:atom:")) {
        const [evidence, neighborhood] = await Promise.all([
          supabaseRpc("resolve_semantic_evidence", { p_semantic_star: star }),
          supabaseRpc("semantic_neighborhood", { p_star_id: star, p_max_hops: 1, p_limit: 40 }),
        ]);
        return NextResponse.json({ star, evidence, neighborhood, provenance: evidence[0]?.resolution_status || "unresolved" });
      }

      const encoded = encodeURIComponent(star);
      const neighborhood = await supabaseTable(
        `edges?select=source_star,target_star,edge_type,metadata&or=(source_star.eq.${encoded},target_star.eq.${encoded})&limit=80`
      );
      return NextResponse.json({
        star,
        evidence: [{ resolution_status: "resolved", evidence_layer: "library" }],
        neighborhood,
        provenance: "resolved",
      });
    }

    if (!q) {
      return NextResponse.json({ hits: [], meta: { query: "", semantic: 0, artifact: 0 } });
    }

    const hits = await supabaseRpc("constellation_view", {
      p_query: q,
      p_limit: limit,
      p_semantic_limit: semanticLimit,
    });

    return NextResponse.json({
      hits,
      meta: {
        query: q,
        semantic: hits.filter((h: any) => h.match_layer === "semantic").length,
        artifact: hits.filter((h: any) => h.match_layer === "artifact").length,
      },
    });
  } catch (error) {
    console.error("Constellation API error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Constellation query failed." },
      { status: 500 }
    );
  }
}
