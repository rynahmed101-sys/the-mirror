"""Validation of Automate-issued bounded discovery grants."""

export type DiscoveryGrant = {
  schema_version: string;
  grant_id: string;
  authority: string;
  issuer: string;
  correlation_id: string;
  issued_at: string;
  expires_at: string;
  max_candidates: number;
  allowed_actions: string[];
  forbidden_actions: string[];
  canonical_mutation_allowed: boolean;
};

export function validateDiscoveryGrant(value: unknown, now = new Date()): DiscoveryGrant {
  if (!value || typeof value !== "object") throw new Error("discoveryGrant is required");
  const grant = value as Record<string, unknown>;
  if (grant.schema_version !== "automate.mirror_discovery_grant.v1") throw new Error("invalid discovery grant schema");
  if (grant.authority !== "UNTRUSTED_EXPLORATION_PERMISSION") throw new Error("invalid discovery grant authority");
  if (grant.issuer !== "automate") throw new Error("discovery grant issuer must be automate");
  if (grant.canonical_mutation_allowed !== false) throw new Error("discovery grant cannot permit canonical mutation");
  if (grant.max_candidates !== 1) throw new Error("discovery grant must allow exactly one candidate");
  if (typeof grant.grant_id !== "string" || !/^dgrant_[0-9a-f]{32}$/.test(grant.grant_id)) throw new Error("invalid discovery grant id");
  if (typeof grant.correlation_id !== "string" || grant.correlation_id.length < 8) throw new Error("invalid discovery grant correlation id");
  if (!Array.isArray(grant.allowed_actions) || !grant.allowed_actions.includes("propose_new_capability")) throw new Error("discovery grant does not permit capability proposals");
  if (!Array.isArray(grant.forbidden_actions) || !grant.forbidden_actions.includes("mutate_canonical_inventory") || !grant.forbidden_actions.includes("mutate_phase_ledger")) throw new Error("discovery grant is missing canonical mutation prohibitions");

  const issued = Date.parse(String(grant.issued_at || ""));
  const expires = Date.parse(String(grant.expires_at || ""));
  const current = now.getTime();
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || current < issued || current >= expires) {
    throw new Error("discovery grant is expired or has invalid timestamps");
  }
  if (expires - issued > 86_400_000) throw new Error("discovery grant TTL exceeds 24 hours");
  return grant as DiscoveryGrant;
}
