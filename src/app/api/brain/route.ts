import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { getOperationalBrain } from "@/lib/lab/brainController";

export const runtime = "nodejs";

export async function GET(req:Request){
  const principal=await resolveRequestPrincipal(req);
  if(principal?.kind!=="CONTROL") return NextResponse.json({error:"Admin access required."},{status:403});
  try{
    const brain=await getOperationalBrain("mirror-primary");
    return NextResponse.json(brain,{headers:{"Cache-Control":"no-store"}});
  }catch(error:any){
    return NextResponse.json({error:error?.message||String(error)},{status:500});
  }
}
