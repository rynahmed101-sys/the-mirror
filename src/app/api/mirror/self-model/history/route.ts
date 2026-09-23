import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { eq, desc } from "drizzle-orm";

const tables:any=isPg?pgSchema:sqliteSchema;
const {selfModels,selfModelClaims}=tables;
function arr(v:any){if(Array.isArray(v))return v;if(typeof v!=="string")return [];try{return JSON.parse(v);}catch{return [];}}
export async function GET(req:Request){
  try{
    const actor=await requireExperimentalActor(req,new URL(req.url).searchParams.get("agentId"));
    const history=await db.select().from(selfModels).where(eq(selfModels.agentId,actor.agentId)).orderBy(desc(selfModels.version));
    const result:any[]=[];
    for(const m of history as any[]){
      const claims=await db.select().from(selfModelClaims).where(eq(selfModelClaims.selfModelId,m.id));
      result.push({...m,claimCount:claims.length,claims:claims.map((c:any)=>({...c,supportingEvidence:arr(c.supportingEvidence),counterevidence:arr(c.counterevidence),rawEventIds:arr(c.rawEventIds)}))});
    }
    return NextResponse.json(result);
  }catch(error:any){return NextResponse.json({error:error?.message||String(error)},{status:403});}
}