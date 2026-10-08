import { describe, expect, it } from "vitest";
import { validateDiscoveryGrant } from "../src/lib/research/discoveryGrant";

const validGrant = {
  schema_version: "automate.mirror_discovery_grant.v1",
  grant_id: "dgrant_" + "a".repeat(32),
  authority: "UNTRUSTED_EXPLORATION_PERMISSION",
  issuer: "automate",
  correlation_id: "ctrl_test1234",
  issued_at: "2026-10-07T08:00:00.000Z",
  expires_at: "2026-10-07T08:15:00.000Z",
  max_candidates: 1,
  allowed_actions: ["research_world", "propose_new_capability"],
  forbidden_actions: ["mutate_canonical_inventory", "mutate_phase_ledger", "merge_pull_request", "certify_capability"],
  canonical_mutation_allowed: false,
};

describe("discovery grant validation", () => {
  it("accepts a bounded Automate grant", () => {
    const result = validateDiscoveryGrant(validGrant, new Date("2026-10-07T08:05:00.000Z"));
    expect(result.grant_id).toBe(validGrant.grant_id);
  });

  it("rejects an expired grant", () => {
    expect(() =>
      validateDiscoveryGrant(validGrant, new Date("2026-10-07T08:20:00.000Z"))
    ).toThrow(/expired/i);
  });

  it("rejects a grant that permits canonical mutation", () => {
    expect(() =>
      validateDiscoveryGrant(
        { ...validGrant, canonical_mutation_allowed: true },
        new Date("2026-10-07T08:05:00.000Z"),
      )
    ).toThrow(/canonical mutation/i);
  });

  it("rejects a grant without proposal permission", () => {
    expect(() =>
      validateDiscoveryGrant(
        { ...validGrant, allowed_actions: ["research_world"] },
        new Date("2026-10-07T08:05:00.000Z"),
      )
    ).toThrow(/capability proposals/i);
  });
});
