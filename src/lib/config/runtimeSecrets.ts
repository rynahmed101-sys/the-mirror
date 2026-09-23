import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { isPg, neonSql, sqlite } from "../db";

type RuntimeSecretName = "ollama_api_key";
const TABLE = "mirror_runtime_secrets";

function encryptionKey() {
  const value = process.env.MIRROR_SECRET_KEY || process.env.JWT_SECRET;
  if (!value || value === "change-me-in-production") throw new Error("Mirror runtime secret encryption key is not configured securely.");
  return createHash("sha256").update(value).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decrypt(value: string) {
  const [ivPart, tagPart, dataPart] = value.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Invalid encrypted runtime secret.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

async function ensureTable() {
  if (isPg) {
    if (!neonSql) throw new Error("Neon SQL runtime unavailable.");
    await neonSql\`CREATE TABLE IF NOT EXISTS mirror_runtime_secrets (
      name TEXT PRIMARY KEY,
      encrypted_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )\`;
  } else if (sqlite) {
    sqlite.exec(\`CREATE TABLE IF NOT EXISTS mirror_runtime_secrets (
      name TEXT PRIMARY KEY,
      encrypted_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )\`);
  }
}

export async function setRuntimeSecret(name: RuntimeSecretName, value: string) {
  await ensureTable();
  const encrypted = encrypt(value.trim());
  if (isPg) {
    await neonSql\`INSERT INTO mirror_runtime_secrets (name, encrypted_value, updated_at)
      VALUES (\${name}, \${encrypted}, NOW())
      ON CONFLICT (name) DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value, updated_at = NOW()\`;
  } else {
    sqlite!.prepare(\`INSERT INTO mirror_runtime_secrets(name, encrypted_value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET encrypted_value=excluded.encrypted_value, updated_at=excluded.updated_at\`)
      .run(name, encrypted, new Date().toISOString());
  }
}

export async function clearRuntimeSecret(name: RuntimeSecretName) {
  await ensureTable();
  if (isPg) await neonSql\`DELETE FROM mirror_runtime_secrets WHERE name = \${name}\`;
  else sqlite!.prepare(\`DELETE FROM mirror_runtime_secrets WHERE name = ?\`).run(name);
}

export async function getRuntimeSecret(name: RuntimeSecretName) {
  await ensureTable();
  try {
    if (isPg) {
      const rows = await neonSql\`SELECT encrypted_value FROM mirror_runtime_secrets WHERE name = \${name} LIMIT 1\`;
      if (!rows?.length) return null;
      return decrypt(String(rows[0].encrypted_value));
    }
    const row = sqlite!.prepare(\`SELECT encrypted_value FROM mirror_runtime_secrets WHERE name = ? LIMIT 1\`).get(name) as { encrypted_value?: string } | undefined;
    return row?.encrypted_value ? decrypt(row.encrypted_value) : null;
  } catch {
    return null;
  }
}

export async function getConfiguredOllamaApiKey() {
  return (await getRuntimeSecret("ollama_api_key")) || process.env.OLLAMA_API_KEY || "";
}

export async function hasConfiguredRuntimeSecret(name: RuntimeSecretName) {
  return Boolean(await getRuntimeSecret(name));
}
