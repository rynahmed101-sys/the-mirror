import { NextResponse } from "next/server";
import { KNOWLEDGE_CONNECTORS, searchKnowledge } from "@/lib/knowledge/connectors";
import { resolveRequestPrincipal } from "@/lib/auth";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";

const tables:any=isPg?pgSchema:sqliteSchema;
const { agents }=tables;

export const runtime="nodejs";

export async function POST(req:Request){
  const principal=await resolveRequestPrincipal(req);
  if(!principal) return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const body=await req.json();
    const connector=String(body.connector) as any;
    if(!KNOWLEDGE_CONNECTORS.some(x=>x.id===connector)) return NextResponse.json({error:"Unknown connector."},{status:400});
    const results=await searchKnowledge(connector,String(body.query||""));
    const agentId=principal.kind==="AGENT"?principal.agentId:principal.kind==="TEMP_EXTERNAL"?"external-guest":"mirror-primary";
    return NextResponse.json({connector,query:String(body.query||""),results,agentId});
  }catch(error:any){ return NextResponse.json({error:error?.message||String(error)},{status:400}); }
}
