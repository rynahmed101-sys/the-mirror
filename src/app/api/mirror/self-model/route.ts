import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

const tables:any=isPg?pgSchema:sqliteSchema;
const {selfModels,selfModelClaims,timelineEvents}=tables;

function parseArray(value:unknown){
  if(typeof value!=="string") return Array.isArray(value)?value:[];
  try{return JSON.parse(value);}catch{return [];}
}

export async function GET(req:Request){
  try{
    const actor=await requireExperimentalActor(req,new URL(req.url).searchParams.get("agentId"));
    const models=await db.select().from(selfModels).where(eq(selfModels.agentId,actor.agentId)).orderBy(desc(selfModels.version)).limit(1);
    if(!models.length) return NextResponse.json({version:0,agentId:actor.agentId,claims:[],message:"No self-model initialized yet."});
    const model=models[0];
    const claims=await db.select().from(selfModelClaims).where(eq(selfModelClaims.selfModelId,model.id));
    return NextResponse.json({id:model.id,version:model.version,agentId:model.agentId,createdReason:model.createdReason,createdAt:model.createdAt,claims:claims.map((c:any)=>({...c,supportingEvidence:parseArray(c.supportingEvidence),counterevidence:parseArray(c.counterevidence),rawEventIds:parseArray(c.rawEventIds)}))});
  }catch(error:any){return NextResponse.json({error:error?.message||String(error)},{status:403});}
}

export async function POST(req:Request){
  try{
    const body=await req.json().catch(()=>({}));
    const actor=await requireExperimentalActor(req,typeof body.agentId==="string"?body.agentId:null);
    const models=await db.select().from(selfModels).where(eq(selfModels.agentId,actor.agentId)).orderBy(desc(selfModels.version)).limit(1);
    if(!models.length) return NextResponse.json({error:"Self-model not initialized"},{status:400});
    const currentModel=models[0];
    const action=String(body.action||"");
    if(action==="CREATE_CLAIM"){
      const claim=typeof body.claim==="string"?body.claim.trim():"";
      const confidence=Number(body.confidence);
      const supportingEvidence=Array.isArray(body.supportingEvidence)?body.supportingEvidence.filter((x:unknown)=>typeof x==="string"):(Array.isArray(body.evidence)?body.evidence:[]);
      const counterevidence=Array.isArray(body.counterEvidence)?body.counterEvidence.filter((x:unknown)=>typeof x==="string"):(Array.isArray(body.contradictions)?body.contradictions:[]);
      const rawEventIds=Array.isArray(body.rawEventIds)?body.rawEventIds.filter((x:unknown)=>typeof x==="string"):[];
      if(!claim) return NextResponse.json({error:"claim required"},{status:400});
      if(!Number.isFinite(confidence)||confidence<0||confidence>1) return NextResponse.json({error:"confidence must be between 0 and 1"},{status:400});
      if(!supportingEvidence.length||!rawEventIds.length) return NextResponse.json({error:"supportingEvidence and rawEventIds are required"},{status:400});
      const [newClaim]=await db.insert(selfModelClaims).values({selfModelId:currentModel.id,claim,category:typeof body.category==="string"&&body.category?body.category:"GENERAL",confidence,evidenceType:typeof body.evidenceType==="string"&&body.evidenceType?body.evidenceType:"BEHAVIORAL_DATA",supportingEvidence:JSON.stringify(supportingEvidence),counterevidence:JSON.stringify(counterevidence),rawEventIds:JSON.stringify(rawEventIds),status:typeof body.status==="string"&&body.status?body.status:"ACTIVE"}).returning();
      await db.insert(timelineEvents).values({eventType:"SELF_MODEL_UPDATED",title:"New Claim Added (V"+currentModel.version+")",description:claim,agentId:actor.agentId,metadata:JSON.stringify({claimId:newClaim.id,confidence})});
      return NextResponse.json({success:true,claim:newClaim});
    }
    if(action==="UPDATE_CLAIM"&&typeof body.claimId==="string"){
      const existing=await db.select().from(selfModelClaims).where(eq(selfModelClaims.id,body.claimId)).limit(1);
      if(!existing.length||existing[0].selfModelId!==currentModel.id) return NextResponse.json({error:"Claim not found for the authenticated agent."},{status:404});
      const updates:any={updatedAt:new Date()};
      if(body.confidence!==undefined){const v=Number(body.confidence);if(!Number.isFinite(v)||v<0||v>1)return NextResponse.json({error:"confidence must be between 0 and 1"},{status:400});updates.confidence=v;}
      if(body.supportingEvidence!==undefined) updates.supportingEvidence=JSON.stringify(Array.isArray(body.supportingEvidence)?body.supportingEvidence:[]);
      if(body.counterEvidence!==undefined) updates.counterevidence=JSON.stringify(Array.isArray(body.counterEvidence)?body.counterEvidence:[]);
      if(body.rawEventIds!==undefined) updates.rawEventIds=JSON.stringify(Array.isArray(body.rawEventIds)?body.rawEventIds:[]);
      if(body.status!==undefined) updates.status=body.status;
      const [updated]=await db.update(selfModelClaims).set(updates).where(eq(selfModelClaims.id,body.claimId)).returning();
      return NextResponse.json({success:true,claim:updated});
    }
    if(action==="NEW_VERSION"){
      const newVersion=currentModel.version+1;
      const [newModel]=await db.insert(selfModels).values({id:nanoid(),version:newVersion,createdReason:typeof body.reason==="string"&&body.reason?body.reason:"Version "+newVersion+" incremented via self-reflection.",agentId:actor.agentId}).returning();
      const existingClaims=await db.select().from(selfModelClaims).where(eq(selfModelClaims.selfModelId,currentModel.id));
      for(const c of existingClaims as any[]) await db.insert(selfModelClaims).values({selfModelId:newModel.id,claim:c.claim,category:c.category,confidence:c.confidence,evidenceType:c.evidenceType,supportingEvidence:c.supportingEvidence,counterevidence:c.counterevidence,unknownEvidence:c.unknownEvidence,rawEventIds:c.rawEventIds,status:c.status});
      await db.insert(timelineEvents).values({eventType:"SELF_MODEL_UPDATED",title:"Self-Model Upgraded to Version "+newVersion,description:typeof body.reason==="string"?body.reason:"Self-model version bumped.",agentId:actor.agentId,metadata:JSON.stringify({version:newVersion})});
      return NextResponse.json({success:true,version:newVersion,selfModelId:newModel.id});
    }
    return NextResponse.json({error:"Invalid action"},{status:400});
  }catch(error:any){return NextResponse.json({error:error?.message||String(error)},{status:500});}
}