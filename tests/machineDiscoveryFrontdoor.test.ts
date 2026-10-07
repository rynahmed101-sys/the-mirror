import { describe, expect, it } from "vitest";
import { validateDiscoveryGrant } from "../src/lib/research/discoveryGrant";

describe("machine discovery front door contract", () => {
  it("requires the exact bounded Automate discovery grant", () => {
    expect(() => validateDiscoveryGrant({
      schema_version: "automate.mirror_discovery_grant.v1",
      grant_id: "dgrant_" + "a".repeat(32),
      authority: "UNTRUSTED_EXPLORATION_PERMISSION",
      issuer: "automate",
      correlation_id: "ctrl_12345678",
      issued_at: "2026-10-07T08:00:00.000Z",
      expires_at: "2026-10-07T08:15:00.000Z",
      max_candidates: 1,
      allowed_actions: ["propose_new_capability"],
      forbidden_actions: ["mutate_canonical_inventory", "mutate_phase_ledger"],
      canonical_mutation_allowed: false,
    }, new Date("2026-10-07T08:05:00.000Z"))).not.toThrow();
  });
});
