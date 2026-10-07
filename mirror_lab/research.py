"""Bounded, provenance-first scientific literature and code research tools.

Research is an instrument. It is deliberately biased toward established/reference
sources for first-pass grounding, but it never converts agreement with a reference
theory into an acceptance criterion for a novel model.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class ResearchRecord:
    provider: str
    title: str
    locator: str
    kind: str
    year: int | None = None
    abstract: str | None = None
    authors: tuple[str, ...] = ()
    score: float | None = None
    established_reference: bool = False
    reference_candidate: bool = False
    raw: dict[str, Any] | None = None

    @property
    def content_sha256(self) -> str:
        payload = json.dumps(
            {
                "provider": self.provider,
                "title": self.title,
                "locator": self.locator,
                "kind": self.kind,
                "year": self.year,
                "abstract": self.abstract,
                "authors": self.authors,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(payload.encode()).hexdigest()


class ResearchProvider(Protocol):
    name: str
    established_reference: bool

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        ...


def _get_json(url: str, *, timeout: float = 15.0, headers: dict[str, str] | None = None) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "the-mirror-lab/0.1", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        body = response.read(2_000_000)
    return json.loads(body)


class OpenAlexProvider:
    name = "openalex"
    established_reference = True

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        params = urllib.parse.urlencode({"search": query, "per-page": min(limit, 10)})
        payload = _get_json(f"https://api.openalex.org/works?{params}")
        return [
            ResearchRecord(
                provider=self.name,
                title=str(x.get("display_name") or ""),
                locator=str(x.get("doi") or x.get("id") or ""),
                kind=str(x.get("type") or "work"),
                year=x.get("publication_year"),
                abstract=None,
                authors=tuple(
                    str(a.get("author", {}).get("display_name"))
                    for a in x.get("authorships", [])[:10]
                    if a.get("author", {}).get("display_name")
                ),
                score=float(x.get("relevance_score", 0.0)),
                established_reference=False,
                reference_candidate=True,
                raw=x,
            )
            for x in payload.get("results", [])
            if x.get("display_name")
        ]


class CrossrefProvider:
    name = "crossref"
    established_reference = True

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        params = urllib.parse.urlencode({"query": query, "rows": min(limit, 10)})
        payload = _get_json(f"https://api.crossref.org/works?{params}")
        return [
            ResearchRecord(
                provider=self.name,
                title=" ".join(x.get("title", [])[:1]),
                locator=str(x.get("URL") or ("https://doi.org/" + x.get("DOI", ""))),
                kind=str(x.get("type") or "work"),
                year=((x.get("published-print") or x.get("published-online") or {}).get("date-parts") or [[None]])[0][0],
                authors=tuple(
                    f"{a.get('given','')} {a.get('family','')}".strip()
                    for a in x.get("author", [])[:10]
                ),
                score=None,
                established_reference=False,
                reference_candidate=True,
                raw=x,
            )
            for x in payload.get("message", {}).get("items", [])
            if x.get("title")
        ]


class InspireHEPProvider:
    name = "inspirehep"
    established_reference = True

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        params = urllib.parse.urlencode({"q": query, "size": min(limit, 10)})
        payload = _get_json(f"https://inspirehep.net/api/literature?{params}")
        records: list[ResearchRecord] = []
        for hit in payload.get("hits", {}).get("hits", []):
            meta = hit.get("metadata", {})
            title = str((meta.get("titles") or [{}])[0].get("title") or "")
            records.append(
                ResearchRecord(
                    provider=self.name,
                    title=title,
                    locator=f"https://inspirehep.net/literature/{hit.get('id')}",
                    kind="physics_literature",
                    year=meta.get("preprint_date", "")[:4] if meta.get("preprint_date") else None,
                    authors=tuple(
                        str(a.get("full_name"))
                        for a in meta.get("authors", [])[:10]
                        if a.get("full_name")
                    ),
                    established_reference=False,
                    reference_candidate=True,
                    raw=hit,
                )
            )
        return [r for r in records if r.title]


class SemanticScholarProvider:
    name = "semanticscholar"
    established_reference = True

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        params = urllib.parse.urlencode({
            "query": query,
            "limit": min(limit, 10),
            "fields": "title,abstract,year,authors,url,citationCount",
        })
        headers = {}
        if os.getenv("SEMANTIC_SCHOLAR_API_KEY"):
            headers["x-api-key"] = os.environ["SEMANTIC_SCHOLAR_API_KEY"]
        payload = _get_json(
            f"https://api.semanticscholar.org/graph/v1/paper/search?{params}",
            headers=headers,
        )
        return [
            ResearchRecord(
                provider=self.name,
                title=str(x.get("title") or ""),
                locator=str(x.get("url") or f"https://www.semanticscholar.org/paper/{x.get('paperId','')}"),
                kind="paper",
                year=x.get("year"),
                abstract=x.get("abstract"),
                authors=tuple(str(a.get("name")) for a in x.get("authors", [])[:10] if a.get("name")),
                score=float(x.get("citationCount") or 0),
                established_reference=False,
                reference_candidate=True,
                raw=x,
            )
            for x in payload.get("data", [])
            if x.get("title")
        ]


class ArxivProvider:
    name = "arxiv"
    established_reference = False

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        params = urllib.parse.urlencode({
            "search_query": f"all:{query}",
            "start": 0,
            "max_results": min(limit, 10),
        })
        # arXiv's Atom endpoint is intentionally parsed without an XML dependency.
        req = urllib.request.Request(
            f"https://export.arxiv.org/api/query?{params}",
            headers={"User-Agent": "the-mirror-lab/0.1"},
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            xml = response.read(2_000_000).decode("utf-8", "replace")
        import re
        entries = re.findall(r"<entry>(.*?)</entry>", xml, re.S)
        out: list[ResearchRecord] = []
        for entry in entries[:limit]:
            title = re.search(r"<title>(.*?)</title>", entry, re.S)
            link = re.search(r'<id>(.*?)</id>', entry, re.S)
            summary = re.search(r"<summary>(.*?)</summary>", entry, re.S)
            if title and link:
                out.append(ResearchRecord(
                    provider=self.name,
                    title=" ".join(title.group(1).split()),
                    locator=link.group(1).strip(),
                    kind="preprint",
                    abstract=" ".join(summary.group(1).split()) if summary else None,
                    established_reference=False,
                ))
        return out


class GitHubProvider:
    name = "github"
    established_reference = False

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        params = urllib.parse.urlencode({"q": query, "per_page": min(limit, 10)})
        payload = _get_json(f"https://api.github.com/search/repositories?{params}")
        return [
            ResearchRecord(
                provider=self.name,
                title=str(x.get("full_name") or ""),
                locator=str(x.get("html_url") or ""),
                kind="repository",
                score=float(x.get("stargazers_count") or 0),
                established_reference=False,
                raw=x,
            )
            for x in payload.get("items", [])
        ]


class HuggingFaceProvider:
    name = "huggingface"
    established_reference = False

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        params = urllib.parse.urlencode({"search": query, "limit": min(limit, 10)})
        payload = _get_json(f"https://huggingface.co/api/models?{params}")
        return [
            ResearchRecord(
                provider=self.name,
                title=str(x.get("id") or ""),
                locator="https://huggingface.co/" + str(x.get("id") or ""),
                kind="model",
                score=float(x.get("downloads") or 0),
                established_reference=False,
                raw=x,
            )
            for x in payload
            if x.get("id")
        ]

    def fetch(self, locator: str, *, max_bytes: int = 2_000_000) -> dict[str, Any]:
        """Fetch a bounded source and preserve its content hash.

        Only HTTPS sources are accepted. The optional MIRROR_ALLOWED_RESEARCH_DOMAINS
        variable can narrow access further.
        """
        parsed = urllib.parse.urlparse(locator)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("research fetch requires an HTTPS URL")
        allowed = os.getenv("MIRROR_ALLOWED_RESEARCH_DOMAINS", "").strip()
        if allowed:
            domains = {x.strip().lower() for x in allowed.split(",") if x.strip()}
            if parsed.hostname.lower() not in domains:
                raise ValueError("research source domain is not allowlisted")
        max_bytes = min(max(max_bytes, 1_024), 2_000_000)
        req = urllib.request.Request(locator, headers={"User-Agent": "the-mirror-lab/0.1"})
        with urllib.request.urlopen(req, timeout=20) as response:
            data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise ValueError("research source exceeds bounded fetch size")
            content_type = response.headers.get("content-type", "")
        return {
            "locator": locator,
            "content_type": content_type,
            "bytes": len(data),
            "content_sha256": hashlib.sha256(data).hexdigest(),
            "content": data.decode("utf-8", "replace"),
        }


DEFAULT_PROVIDERS: tuple[ResearchProvider, ...] = (
    OpenAlexProvider(),
    CrossrefProvider(),
    InspireHEPProvider(),
    SemanticScholarProvider(),
    ArxivProvider(),
    GitHubProvider(),
    HuggingFaceProvider(),
)


@dataclass(frozen=True)
class ResearchPlan:
    query: str
    reference_first: bool = True
    providers: tuple[str, ...] = ()
    limit_per_provider: int = 5


class ResearchTool:
    """Execute bounded multi-source research with reference-first ordering."""

    def __init__(self, providers: tuple[ResearchProvider, ...] = DEFAULT_PROVIDERS) -> None:
        self._providers = {p.name: p for p in providers}

    def plan(self, query: str, *, limit_per_provider: int = 5) -> ResearchPlan:
        return ResearchPlan(query=query, limit_per_provider=min(max(limit_per_provider, 1), 10))

    def search(self, plan: ResearchPlan) -> dict[str, Any]:
        selected = list(self._providers.values())
        if plan.providers:
            selected = [self._providers[n] for n in plan.providers if n in self._providers]
        if plan.reference_first:
            selected.sort(key=lambda p: (not p.established_reference, p.name))
        records: list[ResearchRecord] = []
        errors: list[dict[str, str]] = []
        for provider in selected:
            started = time.monotonic()
            try:
                records.extend(provider.search(plan.query, plan.limit_per_provider))
            except Exception as exc:
                errors.append({"provider": provider.name, "error": str(exc)})
            if time.monotonic() - started > 15:
                errors.append({"provider": provider.name, "error": "provider exceeded 15s per-provider budget"})
        records.sort(
            key=lambda r: (
                not (r.established_reference or r.reference_candidate),
                -(r.score or 0.0),
                r.provider,
                r.title.lower(),
            )
        )
        return {
            "query": plan.query,
            "reference_first": plan.reference_first,
            "records": [r.__dict__ | {"content_sha256": r.content_sha256} for r in records],
            "errors": errors,
            "provider_order": [p.name for p in selected],
        }
