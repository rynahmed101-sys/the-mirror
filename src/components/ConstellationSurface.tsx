"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Box, FileText, GitBranch, Search, AlertTriangle, Star, Sparkles, ExternalLink } from "lucide-react";

type Hit = {
  star_id: string;
  kind: string;
  name?: string | null;
  path?: string | null;
  library_file_id?: string | null;
  atom_type?: string | null;
  value?: string | null;
  confidence?: number | null;
  source_locator?: Record<string, unknown> | null;
  match_layer: string;
  match_rank: number;
};

type Detail = {
  star: string;
  evidence: Array<Record<string, any>>;
  neighborhood: Array<Record<string, any>>;
  provenance: string;
};

const legend = [
  ["semantic", "Semantic node", Sparkles],
  ["artifact", "Constellation / artifact", Star],
  ["edge", "Graph relationship", GitBranch],
  ["bundle", "Transport-bundle evidence", Box],
  ["library", "Resolved Library artifact", FileText],
  ["unresolved", "Unresolved provenance", AlertTriangle],
] as const;

export default function ConstellationSurface() {
  const [query, setQuery] = useState("quartic");
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState<Hit | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (event?: React.FormEvent) => {
    event?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/constellation?q=${encodeURIComponent(q)}&limit=30&semanticLimit=30`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed");
      setHits(Array.isArray(data.hits) ? data.hits : []);
      setSelected(null);
      setDetail(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const inspect = async (hit: Hit) => {
    setSelected(hit);
    setDetail(null);
    setError(null);
    try {
      const response = await fetch(`/api/constellation?star=${encodeURIComponent(hit.star_id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not inspect node");
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not inspect node");
    }
  };

  useEffect(() => { void runSearch(); }, [runSearch]);

  const counts = useMemo(() => ({
    semantic: hits.filter((h) => h.match_layer === "semantic").length,
    artifact: hits.filter((h) => h.match_layer === "artifact").length,
  }), [hits]);

  return (
    <main className="min-h-screen bg-[#050505] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070708]/90 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Back to Mirror">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-wide">CONSTELLATION</h1>
                <span className="rounded-full border border-red-500/20 bg-red-500/5 px-2 py-0.5 font-mono text-[10px] uppercase text-red-300">provenance-aware</span>
              </div>
              <p className="font-mono text-[11px] text-slate-500">search → semantic hit → neighborhood → evidence → source artifact</p>
            </div>
          </div>
          <div className="hidden gap-2 text-[11px] font-mono text-slate-500 sm:flex">
            <span>{counts.semantic} semantic</span><span>·</span><span>{counts.artifact} artifact</span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-5 py-5">
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {legend.map(([key, label, Icon]) => (
            <div key={key} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
              <Icon className={`h-3.5 w-3.5 ${key === "unresolved" ? "text-amber-400" : key === "bundle" ? "text-violet-300" : key === "library" ? "text-emerald-300" : "text-slate-300"}`} />
              <span className="text-[10px] text-slate-400">{label}</span>
            </div>
          ))}
        </div>

        <form onSubmit={runSearch} className="mb-5 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the constellation…" className="w-full rounded-xl border border-white/10 bg-[#0c0c0e] py-3 pl-10 pr-4 text-sm outline-none transition focus:border-red-500/40" />
          </div>
          <button disabled={loading} className="rounded-xl border border-red-500/25 bg-red-950/40 px-5 text-sm font-medium text-red-100 hover:bg-red-900/40 disabled:opacity-50">{loading ? "Searching…" : "Search"}</button>
        </form>

        {error && <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <section className="glass-panel overflow-hidden rounded-2xl border border-white/[0.07]">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <div><h2 className="text-sm font-semibold">Search field</h2><p className="font-mono text-[10px] text-slate-600">Artifacts + semantic atoms, ranked independently</p></div>
              <span className="font-mono text-[10px] text-slate-600">{hits.length} hits</span>
            </div>
            <div className="max-h-[68vh] overflow-y-auto p-2">
              {hits.length === 0 && !loading ? <div className="p-10 text-center text-sm text-slate-600">No constellation hits.</div> : hits.map((hit) => {
                const semantic = hit.match_layer === "semantic";
                const active = selected?.star_id === hit.star_id;
                return (
                  <button key={`${hit.match_layer}:${hit.star_id}`} onClick={() => inspect(hit)} className={`mb-1 w-full rounded-xl border p-3 text-left transition ${active ? "border-red-500/30 bg-red-500/[0.06]" : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.025]"}`}>
                    <div className="flex gap-3">
                      <div className={`mt-0.5 rounded-lg border p-2 ${semantic ? "border-violet-400/20 bg-violet-400/5 text-violet-300" : "border-amber-300/20 bg-amber-300/5 text-amber-200"}`}>{semantic ? <Sparkles className="h-4 w-4" /> : <Star className="h-4 w-4" />}</div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{semantic ? "semantic node" : "artifact node"}</span>
                          <span className="font-mono text-[10px] text-slate-700">rank {hit.match_rank}</span>
                        </div>
                        <div className="truncate text-sm font-medium text-slate-200">{hit.name || hit.value || hit.star_id}</div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{hit.value || hit.path || "No display value"}</div>
                        <div className="mt-2 truncate font-mono text-[9px] text-slate-700">{hit.star_id}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="glass-panel min-h-[420px] rounded-2xl border border-white/[0.07] p-4">
            {!selected ? <div className="flex h-full min-h-[390px] flex-col items-center justify-center text-center"><GitBranch className="mb-3 h-8 w-8 text-slate-700" /><h2 className="text-sm text-slate-400">Select a star</h2><p className="mt-1 max-w-xs text-xs leading-5 text-slate-600">The inspector will show the evidence layer and nearby constellation without collapsing unresolved provenance into a fake source.</p></div> : (
              <div className="space-y-4">
                <div><div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-600"><Star className="h-3 w-3" /> selected star</div><h2 className="break-words text-sm font-semibold">{selected.name || selected.value || selected.star_id}</h2><p className="mt-1 break-all font-mono text-[9px] text-slate-700">{selected.star_id}</p></div>
                {selected.path && <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="mb-1 flex items-center gap-2 text-[10px] uppercase text-slate-600"><FileText className="h-3 w-3" /> source artifact</div><div className="break-all text-xs text-slate-300">{selected.path}</div>{selected.library_file_id && <div className="mt-1 break-all font-mono text-[9px] text-slate-700">{selected.library_file_id}</div>}</div>}
                {detail ? <>
                  <div className={`rounded-xl border p-3 ${detail.provenance === "semantic_payload" ? "border-violet-400/20 bg-violet-400/5" : detail.provenance === "unresolved" ? "border-amber-400/20 bg-amber-400/5" : "border-emerald-400/20 bg-emerald-400/5"}`}>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500"><Box className="h-3 w-3" /> evidence</div>
                    <div className="mt-1 text-sm font-medium">{detail.provenance === "semantic_payload" ? "Transport bundle evidence" : detail.provenance === "unresolved" ? "Unresolved provenance" : "Resolved Library artifact"}</div>
                    {detail.evidence?.[0]?.library_path && <div className="mt-1 break-all text-xs text-slate-500">{detail.evidence[0].library_path}</div>}
                    {detail.provenance === "semantic_payload" && <p className="mt-2 text-[10px] leading-4 text-violet-200/70">The semantic identity is real, but the current graph does not establish the original individual Library file. The viewer intentionally preserves that uncertainty.</p>}
                  </div>
                  <div><div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-600"><GitBranch className="h-3 w-3" /> neighborhood</div><div className="max-h-[34vh] space-y-1 overflow-y-auto">{detail.neighborhood?.length ? detail.neighborhood.map((n, i) => <div key={i} className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-2"><div className="flex items-center justify-between gap-2"><span className="text-[10px] text-slate-500">{n.edge_type || "relation"}</span><span className="font-mono text-[9px] text-slate-700">hop {n.hop ?? "—"}</span></div><div className="mt-1 truncate font-mono text-[9px] text-slate-600">{n.value || n.target_star || n.star_id || n.source_star}</div></div>) : <div className="text-xs text-slate-600">No neighborhood edges returned.</div>}</div></div>
                </> : <div className="py-8 text-center text-xs text-slate-600">Inspecting evidence…</div>}
              </div>
            )}
          </aside>
        </div>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3 text-[10px] text-slate-600">
          <span>Provenance is displayed as data, not inferred narrative.</span>
          <span className="font-mono">gt_constellation.constellation_view → resolve_semantic_evidence → semantic_neighborhood</span>
        </footer>
      </section>
    </main>
  );
}
