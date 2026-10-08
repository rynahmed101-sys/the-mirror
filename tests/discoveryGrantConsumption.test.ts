import { describe, expect, it } from "vitest";

describe("durable discovery grant consumption", () => {
  it("defines the replay check against the immutable raw event ledger", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/lib/agent/executor.ts", "utf8");
    expect(source).toContain('like(rawEventLedger.payload, "%" + grant.grant_id + "%")');
    expect(source).not.toContain(".limit(200)");
  });
});
