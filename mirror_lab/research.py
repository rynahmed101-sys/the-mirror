"""Bounded, provenance-first scientific literature and code research tools."""

from __future__ import annotations

import hashlib
import json
import os
import re
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
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "the-mirror-lab/0.1", **(headers or {})},
    )
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
                title=str(item.get("display_name") or ""),
                locator=str(item.get("doi") or item.get("id") or ""),
                kind=str(item.get("type") or "work"),
                year=item.get("publication_year"),
                authors=tuple(
                    str(author.get("author", {}).get("display_name"))
                    for author in item.get("authorships", [])[:10]
                    if author.get("author", {}).get("display_name")
                ),
                score=float(item.get("relevance_score") or 0.0),
                reference_candidate=True,
                raw=item,
            )
            for item in payload.get("results", [])
            if item.get("display_name")
        ]


class CrossrefProvider:
    name = "crossref"
    established_reference = True

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        params = urllib.parse.urlencode({"query": query, "rows": min(limit, 10)})
        payload = _get_json(f"https://api.crossref.org/works?{params}")
        rows = payload.get("message", {}).get("items", [])
        return [
            ResearchRecord(
                provider=self.name,
                title=" ".join(item.get("title", [])[:1]),
                locator=str(item.get("URL") or ("https://doi.org/" + item.get("DOI", ""))),
                kind=str(item.get("type") or "work"),
                year=(
                    (item.get("published-print") or item.get("published-online") or {})
                    .get("date-parts") or [[None]]
                )[0][0],
                authors=tuple(
                    f"{author.get('given', '')} {author.get('family', '')}".strip()
                    for author in item.get("author", [])[:10]
                ),
                reference_candidate=True,
                raw=item,
            )
            for item in rows
            if item.get("title")
        ]


class InspireHEPProvider:
    name = "inspirehep"
    established_reference = True

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        params = urllib.parse.urlencode({"q": query, "size": min(limit, 10)})
        payload = _get_json(f"https://inspirehep.net/api/literature?{params}")
        records: list[ResearchRecord] = []
        for hit in payload.get("hits", {}).get("hits", []):
            metadata = hit.get("metadata", {})
            title = str((metadata.get("titles") or [{}])[0].get("title") or "")
            date = metadata.get("preprint_date")
            records.append(
                ResearchRecord(
                    provider=self.name,
                    title=title,
                    locator=f"https://inspirehep.net/literature/{hit.get('id')}",
                    kind="physics_literature",
                    year=int(date[:4]) if isinstance(date, str) and date[:4].isdigit() else None,
                    authors=tuple(
                        str(author.get("full_name"))
                        for author in metadata.get("authors", [])[:10]
                        if author.get("full_name")
                    ),
                    reference_candidate=True,
                    raw=hit,
                )
            )
        return [record for record in records if record.title]


class SemanticScholarProvider:
    name = "semanticscholar"
    established_reference = True

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        params = urllib.parse.urlencode(
            {
                "query": query,
                "limit": min(limit, 10),
                "fields": "title,abstract,year,authors,url,citationCount",
            }
        )
        headers = {}
        key = os.getenv("SEMANTIC_SCHOLAR_API_KEY")
        if key:
            headers["x-api-key"] = key
        payload = _get_json(
            f"https://api.semanticscholar.org/graph/v1/paper/search?{params}",
            headers=headers,
        )
        return [
            ResearchRecord(
                provider=self.name,
                title=str(item.get("title") or ""),
                locator=str(
                    item.get("url")
                    or f"https://www.semanticscholar.org/paper/{item.get('paperId', '')}"
                ),
                kind="paper",
                year=item.get("year"),
                abstract=item.get("abstract"),
                authors=tuple(
                    str(author.get("name"))
                    for author in item.get("authors", [])[:10]
                    if author.get("name")
                ),
                score=float(item.get("citationCount") or 0),
                reference_candidate=True,
                raw=item,
            )
            for item in payload.get("data", [])
            if item.get("title")
        ]


class ArxivProvider:
    name = "arxiv"
    established_reference = False

    def search(self, query: str, limit: int = 5) -> list[ResearchRecord]:
        params = urllib.parse.urlencode(
            {
                "search_query": f"all:{query}",
                "start": 0,
                "max_results": min(limit, 10),
            }
        )
        request = urllib.request.Request(
            f"https://export.arxiv.org/api/query?{params}",
            headers={"User-Agent": "the-mirror-lab/0.1"},
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            xml = response.read(2_000_000).decode("utf-8", "replace")
        out: list[ResearchRecord] = []
        for entry in re.findall(r"<entry>(.*?)</entry>", xml, re.S)[:limit]:
            title = re.search(r"<title>(.*?)</title>", entry, re.S)
            locator = re.search(r"<id>(.*?)</id>", entry, re.S)
            abstract = re.search(r"<summary>(.*?)</summary>", entry, re.S)
            if title and locator:
                out.append(
                    ResearchRecord(
                        provider=self.name,
                        title=" ".join(title.group(1).split()),
                        locator=locator.group(1).strip(),
                        kind="preprint",
                        abstract=" ".join(abstract.group(1).split()) if abstract else None,
                    )
                )
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
                title=str(item.get("full_name") or ""),
                locator=str(item.get("html_url") or ""),
                kind="repository",
                score=float(item.get("stargazers_count") or 0),
                raw=item,
            )
            for item in payload.get("items", [])
            if item.get("full_name")
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
                title=str(item.get("id") or ""),
                locator="https://huggingface.co/" + str(item.get("id") or ""),
                kind="model",
                score=float(item.get("downloads") or 0),
                raw=item,
            )
            for item in payload
            if item.get("id")
        ]


class ResearchTool:
    """Bounded multi-source research with reference-first ordering."""

    def __init__(
        self,
        providers: tuple[ResearchProvider, ...] = (
            OpenAlexProvider(),
            CrossrefProvider(),
            InspireHEPProvider(),
            SemanticScholarProvider(),
            ArxivProvider(),
            GitHubProvider(),
            HuggingFaceProvider(),
        ),
    ) -> None:
        self._providers = {provider.name: provider for provider in providers}

    def search(
        self,
        query: str,
        *,
        providers: tuple[str, ...] = (),
        limit_per_provider: int = 5,
        total_budget_seconds: float = 60.0,
    ) -> dict[str, Any]:
        if not query.strip():
            raise ValueError("research query is required")
        limit_per_provider = min(max(limit_per_provider, 1), 10)
        selected = (
            [self._providers[name] for name in providers if name in self._providers]
            if providers
            else list(self._providers.values())
        )
        selected.sort(key=lambda provider: (not provider.established_reference, provider.name))
        started = time.monotonic()
        records: list[ResearchRecord] = []
        errors: list[dict[str, str]] = []

        for provider in selected:
            if time.monotonic() - started >= total_budget_seconds:
                errors.append({"provider": provider.name, "error": "research budget exhausted"})
                break
            try:
                records.extend(provider.search(query, limit_per_provider))
            except Exception as exc:
                errors.append({"provider": provider.name, "error": str(exc)})

        records.sort(
            key=lambda record: (
                not (record.established_reference or record.reference_candidate),
                -(record.score or 0.0),
                record.provider,
                record.title.lower(),
            )
        )
        return {
            "query": query,
            "records": [
                {
                    **record.__dict__,
                    "authors": list(record.authors),
                    "content_sha256": record.content_sha256,
                }
                for record in records
            ],
            "errors": errors,
            "provider_order": [provider.name for provider in selected],
        }

    def fetch(self, locator: str, *, max_bytes: int = 2_000_000) -> dict[str, Any]:
        parsed = urllib.parse.urlparse(locator)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("research fetch requires an HTTPS URL")
        allowed = os.getenv("MIRROR_ALLOWED_RESEARCH_DOMAINS", "").strip()
        if allowed:
            domains = {item.strip().lower() for item in allowed.split(",") if item.strip()}
            if parsed.hostname.lower() not in domains:
                raise ValueError("research source domain is not allowlisted")
        max_bytes = min(max(max_bytes, 1_024), 2_000_000)
        request = urllib.request.Request(
            locator,
            headers={"User-Agent": "the-mirror-lab/0.1"},
        )
        with urllib.request.urlopen(request, timeout=20) as response:
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
