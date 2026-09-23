/**
 * THE MIRROR — Auth utilities
 * Simple API-token-based auth for the research environment.
 * Single researcher model — no OAuth needed.
 */

import { db, isPg } from "./db";
import { apiTokens as sqliteApiTokens, agentApiKeys as sqliteAgentApiKeys, agents as sqliteAgents } from "./db/schema";
import { apiTokens as pgApiTokens, agentApiKeys as pgAgentApiKeys, agents as pgAgents } from "./db/schema.pg";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const secret = new TextEncoder().encode(JWT_SECRET);

// ── Session tokens (dashboard login) ───────────────────────

export async function signSession(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── API tokens (external AI client access) ─────────────────

export type ApiPrincipal =
  | { kind: "CONTROL"; tokenType: "ENV" | "DB" | "SESSION" }
  | { kind: "AGENT"; agentId: string }
  | { kind: "TEMP_EXTERNAL"; tokenId: string };

export function isTemporaryExternalToken(row: { permissions?: string | null; name?: string | null }): boolean {
  return row.permissions === "external_experiment" || row.name === "temporary-lab-access";
}

/** Resolve a token to its least-privileged caller identity. */
export async function resolveApiPrincipal(token: string): Promise<ApiPrincipal | null> {
  if (!token) return null;

  const envToken = process.env.MIRROR_API_TOKEN;
  if (envToken && token === envToken) return { kind: "CONTROL", tokenType: "ENV" };

  const hashed = hashToken(token);
  const tokenTable = isPg ? pgApiTokens : sqliteApiTokens;
  const dbToken = await db
    .select()
    .from(tokenTable)
    .where(eq(tokenTable.tokenHash, hashed))
    .limit(1);

  if (dbToken.length > 0) {
    const row = dbToken[0] as any;
    if (isTemporaryExternalToken(row)) return { kind: "TEMP_EXTERNAL", tokenId: String(row.id) };
    return { kind: "CONTROL", tokenType: "DB" };
  }

  const agentKeyTable = isPg ? pgAgentApiKeys : sqliteAgentApiKeys;
  const agentTable = isPg ? pgAgents : sqliteAgents;
  const keyPrefix = token.slice(0, 14);
  const agentKeys = await db.select().from(agentKeyTable).where(eq(agentKeyTable.keyPrefix, keyPrefix));
  for (const key of agentKeys) {
    if (await bcrypt.compare(token, key.apiKeyHash)) {
      const agentRows = await db.select({ isActive: agentTable.isActive }).from(agentTable).where(eq(agentTable.id, key.agentId)).limit(1);
      if (!agentRows.length || agentRows[0].isActive === false) return null;
      return { kind: "AGENT", agentId: key.agentId };
    }
  }

  return null;
}

export async function validateApiToken(token: string): Promise<boolean> {
  return (await resolveApiPrincipal(token)) !== null;
}

export async function validateControlToken(token: string): Promise<boolean> {
  const envToken = process.env.MIRROR_API_TOKEN;
  return Boolean(envToken && token && token === envToken);
}

export async function revokeApiToken(id: string) {
  const tokenTable = isPg ? pgApiTokens : sqliteApiTokens;
  const result = await db.delete(tokenTable).where(eq(tokenTable.id, id));
  const affected = Number((result as any)?.rowCount ?? (result as any)?.changes ?? 0);
  return { id, revoked: affected > 0 };
}

export async function createApiToken(name: string, description?: string) {
  const token = `mirror_${nanoid(32)}`;
  const hashed = hashToken(token);

  const id = nanoid();
  const tokenTable = isPg ? pgApiTokens : sqliteApiTokens;
  await db.insert(tokenTable).values({
    id,
    name,
    tokenPrefix: token.slice(0, 8) + "...",
    tokenHash: hashed,
    permissions: "external_experiment",
  });

  return { id, token };
}

// ── Dashboard password auth ─────────────────────────────────

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envPassword || !password) return false;
  return password === envPassword;
}

export function getAdminUsername(): string {
  return process.env.ADMIN_USERNAME || "admin";
}

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  if (!username || !password) return false;
  if (username !== getAdminUsername()) return false;
  return verifyAdminPassword(password);
}

export async function verifyAdminSession(token: string | null | undefined) {
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload || payload.sub !== "admin" || payload.role !== "ADMIN") {
    return null;
  }
  return payload;
}

export async function resolveRequestPrincipal(req: Request): Promise<ApiPrincipal | null> {
  const bearer = extractBearerToken(req.headers.get("authorization"));
  if (bearer) {
    return resolveApiPrincipal(bearer);
  }

  const sessionToken = extractCookieToken(req.headers.get("cookie"));
  const session = await verifyAdminSession(sessionToken);
  if (session) {
    return { kind: "CONTROL", tokenType: "SESSION" };
  }

  return null;
}

// ── Middleware helper ───────────────────────────────────────

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}

export function extractCookieToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/mirror_session=([^;]+)/);
  return match ? match[1] : null;
}
