/**
 * THE MIRROR — Dual-Dialect Database Layer
 *
 * Local Development: SQLite (via better-sqlite3 + drizzle-orm/better-sqlite3)
 * Production / Vercel: PostgreSQL (via @neondatabase/serverless + drizzle-orm/neon-http)
 *
 * Dialect Selection:
 * If DATABASE_DIALECT=postgres OR DATABASE_URL starts with postgres:// / postgresql://,
 * then Neon PostgreSQL is activated.
 * Otherwise, local SQLite (./data/mirror.db) is preserved as the default.
 */

import * as sqliteSchema from "./schema";
import * as pgSchema from "./schema.pg";

const dialect = (process.env.DATABASE_DIALECT || "").toLowerCase();
const isPostgres = dialect === "postgres" || (
  dialect !== "sqlite" &&
  Boolean(
    process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith("postgres://") ||
     process.env.DATABASE_URL.startsWith("postgresql://"))
  )
);

let dbInstance: any;
let sqliteInstance: any = null;

if (isPostgres) {
  // Production Neon PostgreSQL connection
  // Dynamic require ensures better-sqlite3 and fs are not loaded on Vercel
  const { neon } = require("@neondatabase/serverless");
  const { drizzle: drizzleNeon } = require("drizzle-orm/neon-http");
  const sql = neon(process.env.DATABASE_URL!);
  dbInstance = drizzleNeon(sql, { schema: pgSchema });
} else {
  // Local SQLite connection (default development mode)
  const Database = require("better-sqlite3");
  const { drizzle: drizzleSqlite } = require("drizzle-orm/better-sqlite3");
  const path = require("path");
  const fs = require("fs");

  const dbPath = process.env.DATABASE_URL || "./data/mirror.db";
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma("journal_mode = WAL");
  sqliteInstance.pragma("foreign_keys = ON");

  dbInstance = drizzleSqlite(sqliteInstance, { schema: sqliteSchema });
}

export const isPg = isPostgres;
export const db = dbInstance;
export type DB = typeof db;
export const sqlite = sqliteInstance;
export default db;
