import { NextResponse } from "next/server";
import { resolveApiPrincipal, extractBearerToken } from "@/lib/auth";
import { runControlledSuite } from "@/lib/agent/controlledSuite";

export const runtime="nodejs";

export async function GET(){
  return NextResponse.json({suite:"controlled-perturbation-v1",protocol:"prediction-before-stimulus",trials:["T01","T02","T03","T04","T05"]});
}

export async function POST(req:Request){
  const token=extractBearerToken(req.headers.get("authorization"));
  const principal=token?await resolveApiPrincipal(token):null;
  if(!principal) return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const body=await req.json().catch(()=>({}));
    const agentId=principal.kind==="AGENT"?principal.agentId:(typeof body.agentId==="string"?body.agentId:"mirror-primary");
    if(principal.kind==="AGENT"&&typeof body.agentId==="string"&&body.agentId!==agentId) return NextResponse.json({error:"Forbidden"},{status:403});
    const ids=Array.isArray(body.trialIds)?body.trialIds.map(String):undefined;
    return NextResponse.json(await runControlledSuite(agentId,ids));
  }catch(error:any){
    return NextResponse.json({error:error?.message||String(error)},{status:500});
  }
}
