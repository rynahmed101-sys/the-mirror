import { desc, eq } from "drizzle-orm";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { experiments } = tables;

// Reuse Mirror's canonical control agent so the existing Drizzle foreign-key
// model remains intact. Science-run identity lives in templateType + variables.
const SCIENCE_AGENT_ID = "mirror-primary";

export async function saveScienceRun(result: {
  runId: string;
  theory: { id: string; name: string; version: string };
  metrics: unknown;
  stability: unknown;
  cases: unknown;
}) {
  await db.insert(experiments).values({
    id: result.runId,
    agentId: SCIENCE_AGENT_ID,
    title: `Science Lab — ${result.theory.name}`,
    hypothesis: `Evaluate trusted theory adapter ${result.theory.id} against supplied reference cases.`,
    methodology: "BaseTheory -> execution -> RMSE/absolute/relative error -> stability classification.",
    templateType: "SCIENCE_THEORY_RUN",
    variables: JSON.stringify({ theoryId: result.theory.id, theoryVersion: result.theory.version }),
    status: "COMPLETED",
    results: JSON.stringify({ metrics: result.metrics, stability: result.stability, cases: result.cases }),
    conclusion: JSON.stringify(result.stability),
    createdAt: new Date(),
  } as any);
}

export async function listScienceRuns(limit = 20) {
  const rows = await db.select().from(experiments)
    .where(eq(experiments.templateType, "SCIENCE_THEORY_RUN"))
    .orderBy(desc(experiments.createdAt))
    .limit(Math.min(100, Math.max(1, limit)));

  return rows.map((row: any) => {
    let variables: any = {};
    let results: any = {};
    try { variables = JSON.parse(row.variables || "{}"); } catch {}
    try { results = JSON.parse(row.results || "{}"); } catch {}
    return {
      id: row.id,
      theoryId: variables.theoryId || "unknown",
      theoryName: row.title.replace(/^Science Lab — /, ""),
      status: row.status,
      stability: results.stability ?? null,
      metrics: results.metrics ?? null,
      cases: results.cases ?? [],
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  });
}
