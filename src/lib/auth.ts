/**
 * THE MIRROR — Auth utilities
 * Simple API-token-based auth for the research environment.
 * Single researcher model — no OAuth needed.
 */

import { db } from "./db";
import { apiTokens, systemConfig } from "./db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
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

export async function validateApiToken(token: string): Promise<boolean> {
  if (!token) return false;

  // Check env-level token first (fast path)
  const envToken = process.env.MIRROR_API_TOKEN;
  if (envToken && token === envToken) return true;

  // Check DB tokens
  const hashed = hashToken(token);
  const dbToken = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hashed))
    .limit(1);

  if (dbToken.length > 0) {
    return true;
  }

  return false;
}

export async function createApiToken(name: string, description?: string) {
  const token = `mirror_${nanoid(32)}`;
  const hashed = hashToken(token);

  const id = nanoid();
  await db.insert(apiTokens).values({
    id,
    name,
    tokenPrefix: token.slice(0, 8) + "...", // store partial only for display
    tokenHash: hashed,
    permissions: "full",
  });

  return { id, token }; // Return full token ONCE
}

// ── Dashboard password auth ─────────────────────────────────

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envPassword) return false;
  return password === envPassword;
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
