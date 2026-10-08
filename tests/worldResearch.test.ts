import { describe, expect, it, vi } from "vitest";
import { researchWorld } from "../src/lib/research/worldResearch";

describe("world research provenance", () => {
  it("derives deterministic fallback correlation IDs", async () => {
    const response = {
      ok: true,
      text: async () => JSON.stringify({ message: { items: [] } }),
    };
    vi.stubGlobal("fetch", vi.fn(async () => response as unknown as Response));

    const [first] = await researchWorld({ query: "Taylor series", providers: ["crossref"], limit: 2 });
    const [second] = await researchWorld({ query: "Taylor series", providers: ["crossref"], limit: 2 });

    expect(first.correlationId).toBe(second.correlationId);
    expect(first.correlationId).toMatch(/^mirror_research_[0-9a-f]{32}$/);
  });

  it("binds a deterministic fingerprint to each observed source snapshot", async () => {
    const response = {
      ok: true,
      text: async () => JSON.stringify({
        message: {
          items: [{
            DOI: "10.1234/example",
            title: ["Example result"],
            URL: "https://doi.org/10.1234/example",
            published: { "date-time": "2026-01-01T00:00:00Z" },
            author: [{ family: "Example" }],
            type: "journal-article",
            publisher: "Example Press",
          }],
        },
      }),
    };
    vi.stubGlobal("fetch", vi.fn(async () => response as unknown as Response));

    const [first] = await researchWorld({ query: "example", providers: ["crossref"], limit: 1 });
    const [second] = await researchWorld({ query: "example", providers: ["crossref"], limit: 1 });

    expect(first.sources[0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.sources[0].fingerprint).toBe(second.sources[0].fingerprint);
  });
});
