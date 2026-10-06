/**
 * THE MIRROR — External Research Laboratory
 *
 * World-facing evidence acquisition is deliberately kept outside Automate.
 * This module is an instrument: it retrieves bounded public material and
 * returns provenance-rich observations. It never certifies a claim.
 *
 * Design:
 *   researcher -> provider-neutral query -> bounded provider adapters
 *              -> source snapshot -> provenance -> evidence packet
 *
 * No arbitrary URL fetching. This is intentionally restrictive so "access
 * to the world" does not become "let an AI turn the server into an SSRF toy."
 */

export type ResearchProvider = "crossref" | "openalex" | "arxiv" | "github" | "huggingface";

export interface ResearchRequest {
  query: string;
  providers?: ResearchProvider[];
  limit?: number;
  correlationId?: string;
  maxResponseBytes?: number;
  researchIntent?: { objective?: string; summary?: string; requirements?: string[]; instructions?: string[] };
}

export interface ResearchSource {
  provider: ResearchProvider;
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
  revision?: string | null;
  fingerprint?: string | null;
  excerpt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ResearchResult {
  correlationId: string;
  query: string;
  provider: ResearchProvider;
  sources: ResearchSource[];
  limitations: string[];
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const MAX_RESPONSE_BYTES = 1_500_000;
const REQUEST_TIMEOUT_MS = 12_000;

function correlationId(input?: string) {
  return input && /^[A-Za-z0-9_.:-]{1,128}$/.test(input) ? input : "mirror_research_" + Date.now().toString(36);
}

async function fetchText(url: string, maxResponseBytes = MAX_RESPONSE_BYTES): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "accept": "application/atom+xml, application/xml, text/xml, application/json", "user-agent": "THE-MIRROR-research-lab/1.1" } });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxResponseBytes) throw new Error("response exceeds bounded research payload size");
    return text;
  } finally { clearTimeout(timer); }
}

async function fetchJson(url: string, maxResponseBytes = MAX_RESPONSE_BYTES): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "application/json",
        "user-agent": "THE-MIRROR-research-lab/1.0",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxResponseBytes) {
      throw new Error("response exceeds bounded research payload size");
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function clampQuery(query: string) {
  const q = String(query || "").trim();
  if (!q || q.length > 500) throw new Error("research query must contain 1-500 characters");
  return q;
}

function clampLimit(limit?: number) {
  const n = Number(limit);
  return Number.isFinite(n) ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(n))) : DEFAULT_LIMIT;
}

function source(provider: ResearchProvider, sourceId: string, title: string, url: string, extra: Partial<ResearchSource> = {}): ResearchSource {
  return {
    provider, sourceId, title, url, retrievedAt: new Date().toISOString(),
    revision: extra.revision ?? null, fingerprint: extra.fingerprint ?? null,
    excerpt: extra.excerpt ?? null, metadata: extra.metadata ?? {},
  };
}

async function crossref(query: string, limit: number, maxResponseBytes: number) {
  const data = await fetchJson("https://api.crossref.org/works?query.bibliographic=" + encodeURIComponent(query) + "&rows=" + limit, maxResponseBytes);
  return (data.message?.items || []).slice(0, limit).map((x: any) => source(
    "crossref", String(x.DOI || x.URL || x.title?.[0] || "unknown"),
    String(x.title?.[0] || "Untitled"), String(x.URL || (x.DOI ? "https://doi.org/" + x.DOI : "")),
    { revision: x.published?.["date-time"] || null, metadata: { authors: x.author?.slice(0, 12) || [], type: x.type, publisher: x.publisher } }
  ));
}

async function openalex(query: string, limit: number, maxResponseBytes: number) {
  const data = await fetchJson("https://api.openalex.org/works?search=" + encodeURIComponent(query) + "&per-page=" + limit, maxResponseBytes);
  return (data.results || []).slice(0, limit).map((x: any) => source(
    "openalex", String(x.id || x.doi || x.display_name),
    String(x.display_name || "Untitled"), String(x.primary_location?.landing_page_url || x.doi || x.id || ""),
    { revision: x.publication_date || null, metadata: { citedByCount: x.cited_by_count, type: x.type, concepts: (x.concepts || []).slice(0, 8).map((c: any) => c.display_name) } }
  ));
}

async function arxiv(query: string, limit: number, maxResponseBytes: number) {
  const xml = await fetchText("https://export.arxiv.org/api/query?search_query=all:" + encodeURIComponent(query) + "&start=0&max_results=" + limit, maxResponseBytes);
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, limit);
  return entries.map((m) => {
    const body = m[1];
    const get = (tag: string) => body.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">"))?.[1]?.trim() || "";
    const id = get("id");
    return source("arxiv", id, get("title").replace(/\s+/g, " "), id, {
      revision: get("updated") || null,
      excerpt: get("summary").replace(/\s+/g, " ").slice(0, 1200),
      metadata: { authors: [...body.matchAll(/<name>([\s\S]*?)<\/name>/g)].slice(0, 12).map((a) => a[1]) }
    });
  });
}

async function github(query: string, limit: number, maxResponseBytes: number) {
  const data = await fetchJson("https://api.github.com/search/repositories?q=" + encodeURIComponent(query) + "&per_page=" + limit, maxResponseBytes);
  return (data.items || []).slice(0, limit).map((x: any) => source(
    "github", String(x.full_name), String(x.full_name), String(x.html_url),
    { revision: x.pushed_at || null, metadata: { stars: x.stargazers_count, forks: x.forks_count, language: x.language, license: x.license?.spdx_id || null } }
  ));
}

async function huggingface(query: string, limit: number, maxResponseBytes: number) {
  const data = await fetchJson("https://huggingface.co/api/models?search=" + encodeURIComponent(query) + "&limit=" + limit, maxResponseBytes);
  return (data || []).slice(0, limit).map((x: any) => source(
    "huggingface", String(x.id), String(x.id), "https://huggingface.co/" + x.id,
    { revision: x.lastModified || null, metadata: { downloads: x.downloads, likes: x.likes, pipelineTag: x.pipeline_tag } }
  ));
}

const adapters: Record<ResearchProvider, (q: string, l: number) => Promise<ResearchSource[]>> = {
  crossref, openalex, arxiv, github, huggingface,
};

export async function researchWorld(request: ResearchRequest): Promise<ResearchResult[]> {
  const query = clampQuery(request.query);
  const limit = clampLimit(request.limit);
  const maxResponseBytes = Number.isFinite(Number(request.maxResponseBytes)) ? Math.min(MAX_RESPONSE_BYTES, Math.max(64 * 1024, Math.floor(Number(request.maxResponseBytes)))) : MAX_RESPONSE_BYTES;
  const allowed = new Set<ResearchProvider>(["crossref", "openalex", "arxiv", "github", "huggingface"]);
  const requested = request.providers;
  if (requested && requested.length === 0) throw new Error("providers must contain at least one supported provider when supplied");
  const providers = requested?.length ? requested.filter((p) => allowed.has(p)) : [...allowed];
  if (requested?.length && providers.length !== requested.length) throw new Error("providers contains an unsupported provider");
  const cid = correlationId(request.correlationId);
  if (maxResponseBytes < 64 * 1024) throw new Error("maxResponseBytes is below the minimum safe research budget");
  const results: ResearchResult[] = [];

  for (const provider of providers.slice(0, 5)) {
    const adapter = adapters[provider];
    if (!adapter) continue;
    try {
      const sources = await adapter(query, limit, maxResponseBytes);
      results.push({ correlationId: cid, query, provider, sources, limitations: ["Public-provider result; not scientific proof.", "Provider ranking/relevance is not independently validated."] });
    } catch (error) {
      results.push({ correlationId: cid, query, provider, sources: [], limitations: [String(error instanceof Error ? error.message : error), "Provider unavailable or query failed; no substitution was performed."] });
    }
  }
  return results;
}
