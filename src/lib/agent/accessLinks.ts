import { createHmac, timingSafeEqual } from "crypto";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db, isPg } from "../db";
import * as sqliteSchema from "../db/schema";
import * as pgSchema from "../db/schema.pg";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { apiTokens } = tables;

type LinkRecord = {
  id: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  permissions: string;
  createdAt?: Date;
};

export type MirrorAccessCapability = {
  id: string;
  agentId: string;
  scope: "RESEARCH_AGENT";
  expiresAt: string;
  label: string;
};

const secret = () => {
  const value = process.env.MIRROR_LINK_SECRET || process.env.JWT_SECRET;
  if (!value || value === "change-me-in-production") throw new Error("Mirror access-link secret is not configured securely.");
  return value;
};

function sign(id: string) {
  return createHmac("sha256", secret()).update(id).digest("base64url");
}

function validSignature(id: string, signature: string) {
  const a = Buffer.from(sign(id));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildAccessLink(origin: string, id: string) {
  return origin.replace(/\/$/, "") + "/access/" + encodeURIComponent(id);
}

export async function createMirrorAccessLink(input: {
  origin: string;
  agentId: string;
  label?: string;
  ttlHours?: number;
}): Promise<MirrorAccessCapability & { url: string }> {
  const ttlHours = Math.min(168, Math.max(1, Math.floor(Number(input.ttlHours) || 24)));
  const id = "ml_" + nanoid(28);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const record = {
    kind: "access_link",
    agentId: input.agentId,
    scope: "RESEARCH_AGENT",
    label: String(input.label || "Mirror external laboratory"),
    expiresAt,
  };
  await db.insert(apiTokens).values({
    id,
    name: "access-link:" + record.label.slice(0, 70),
    tokenPrefix: "ml_",
    tokenHash: sign(id),
    permissions: JSON.stringify(record),
  });
  return { id, agentId: input.agentId, scope: "RESEARCH_AGENT", expiresAt, label: record.label, url: buildAccessLink(input.origin, id) };
}

export async function resolveMirrorAccessLink(id: string): Promise<MirrorAccessCapability | null> {
  if (!id || !/^ml_[A-Za-z0-9_-]{10,80}$/.test(id)) return null;
  const rows: LinkRecord[] = await db.select().from(apiTokens).where(eq(apiTokens.id, id)).limit(1);
  const row = rows[0];
  if (!row || !String(row.permissions).startsWith("{")) return null;
  let record: any;
  try { record = JSON.parse(row.permissions); } catch { return null; }
  if (record.kind !== "access_link" || record.scope !== "RESEARCH_AGENT") return null;
  if (new Date(record.expiresAt).getTime() <= Date.now()) return null;
  if (row.tokenHash !== sign(id)) return null;
  return { id, agentId: String(record.agentId), scope: "RESEARCH_AGENT", expiresAt: String(record.expiresAt), label: String(record.label || "Mirror external laboratory") };
}

export function capabilityRequestUrl(id: string, origin: string) {
  return buildAccessLink(origin, id);
}

export async function revokeMirrorAccessLink(id: string) {
  if (!id) return false;
  const result = await db.delete(apiTokens).where(
    and(eq(apiTokens.id, id), eq(apiTokens.tokenPrefix, "ml_")),
  );
  return Number((result as any)?.rowCount ?? (result as any)?.changes ?? 0) > 0;
}
