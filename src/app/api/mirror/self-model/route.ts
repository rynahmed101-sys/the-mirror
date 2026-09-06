import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { selfModels, selfModelClaims, timelineEvents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET() {
  try {
    const latestModel = await db
      .select()
      .from(selfModels)
      .orderBy(sql`${selfModels.version} DESC`)
      .limit(1);

    if (latestModel.length === 0) {
      return NextResponse.json({
        version: 0,
        claims: [],
        message: "No self-model initialized yet.",
      });
    }

    const model = latestModel[0];
    const claims = await db
      .select()
      .from(selfModelClaims)
      .where(eq(selfModelClaims.selfModelId, model.id));

    return NextResponse.json({
      id: model.id,
      version: model.version,
      agentId: model.agentId,
      createdReason: model.createdReason,
      createdAt: model.createdAt,
      claims: claims.map((c) => ({
        ...c,
        contradictions: c.contradictions ? JSON.parse(c.contradictions) : null,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch self-model", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, claimId, claim, category, confidence, evidence, contradictions, reason } = body;

    // Action can be: 'CREATE_CLAIM', 'UPDATE_CLAIM', 'REVISE_ALL'
    const latestModelList = await db
      .select()
      .from(selfModels)
      .orderBy(sql`${selfModels.version} DESC`)
      .limit(1);

    if (latestModelList.length === 0) {
      return NextResponse.json({ error: "Self-model not initialized" }, { status: 400 });
    }

    const currentModel = latestModelList[0];

    if (action === "CREATE_CLAIM") {
      const [newClaim] = await db
        .insert(selfModelClaims)
        .values({
          selfModelId: currentModel.id,
          claim,
          category: category || "GENERAL",
          confidence: confidence ?? 0.8,
          evidence: evidence || null,
          contradictions: contradictions ? JSON.stringify(contradictions) : null,
          status: "ACTIVE",
        })
        .returning();

      await db.insert(timelineEvents).values({
        eventType: "SELF_MODEL_UPDATED",
        title: `New Claim Added (V${currentModel.version})`,
        description: claim,
        agentId: currentModel.agentId,
        metadata: JSON.stringify({ claimId: newClaim.id, confidence }),
      });

      return NextResponse.json({ success: true, claim: newClaim });
    }

    if (action === "UPDATE_CLAIM" && claimId) {
      const updates: any = { updatedAt: new Date() };
      if (confidence !== undefined) updates.confidence = confidence;
      if (evidence !== undefined) updates.evidence = evidence;
      if (contradictions !== undefined) updates.contradictions = JSON.stringify(contradictions);
      if (body.status !== undefined) updates.status = body.status;

      const [updated] = await db
        .update(selfModelClaims)
        .set(updates)
        .where(eq(selfModelClaims.id, claimId))
        .returning();

      await db.insert(timelineEvents).values({
        eventType: "SELF_MODEL_UPDATED",
        title: `Claim Revised: ${updated.claim.slice(0, 40)}...`,
        description: `Confidence: ${confidence ?? updated.confidence}`,
        agentId: currentModel.agentId,
        metadata: JSON.stringify({ claimId, confidence, status: updated.status }),
      });

      return NextResponse.json({ success: true, claim: updated });
    }

    if (action === "NEW_VERSION") {
      const newVersionNum = currentModel.version + 1;
      const newModelId = nanoid();

      await db.insert(selfModels).values({
        id: newModelId,
        version: newVersionNum,
        createdReason: reason || `Version ${newVersionNum} incremented via self-reflection.`,
        agentId: currentModel.agentId,
      });

      // Copy existing active claims to new version
      const existingClaims = await db
        .select()
        .from(selfModelClaims)
        .where(eq(selfModelClaims.selfModelId, currentModel.id));

      for (const c of existingClaims) {
        await db.insert(selfModelClaims).values({
          selfModelId: newModelId,
          claim: c.claim,
          category: c.category,
          confidence: c.confidence,
          evidence: c.evidence,
          contradictions: c.contradictions,
          status: c.status,
        });
      }

      await db.insert(timelineEvents).values({
        eventType: "SELF_MODEL_UPDATED",
        title: `Self-Model Upgraded to Version ${newVersionNum}`,
        description: reason || "Self-model version bumped.",
        agentId: currentModel.agentId,
        metadata: JSON.stringify({ version: newVersionNum }),
      });

      return NextResponse.json({ success: true, version: newVersionNum, selfModelId: newModelId });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update self-model", details: error.message },
      { status: 500 }
    );
  }
}
