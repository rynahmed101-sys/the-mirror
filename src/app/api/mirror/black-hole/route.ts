import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { runAutopilot } from "@/lib/agent/autopilot";
import {
  getBlackHoleState,
  pulseBlackHole,
  startBlackHoleThinking,
  finishBlackHoleThinking,
  settleBlackHole,
  ingestMirrorMemory,
} from "@/lib/mirror/blackHoleState";
import { getOperationalBrain } from "@/lib/lab/brainController";

export const runtime="nodejs";
export const maxDuration=300;

const AGENT_ID="mirror-primary";

export async function GET(req:Request){
  const principal=await resolveRequestPrincipal(req);
  if(principal?.kind!=="CONTROL") return NextResponse.json({error:"Admin access required."},{status:403});
  try{
    const state=await getBlackHoleState(AGENT_ID);
    const brain=await getOperationalBrain(AGENT_ID);
    return NextResponse.json({
      state,
      brain:{
        active:brain.summary.active,
        trained:brain.summary.trained,
        total:brain.summary.total,
        activeNodes:brain.activeNodeIds
      }
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error:any){
    return NextResponse.json({error:error?.message||String(error)},{status:500});
  }
}

export async function POST(req:Request){
  const principal=await resolveRequestPrincipal(req);
  if(principal?.kind!=="CONTROL") return NextResponse.json({error:"Admin access required."},{status:403});

  let body:any={};
  try{ body=await req.json(); }catch{}

  try{
    const action=typeof body?.action==="string" ? body.action : "pulse";

    if(action==="pulse"){
      return NextResponse.json({success:true,state:await pulseBlackHole(AGENT_ID)});
    }

    if(action==="settle"){
      return NextResponse.json({success:true,state:await settleBlackHole(AGENT_ID)});
    }

    if(action==="ingest"){
      const memory=await ingestMirrorMemory(AGENT_ID);
      return NextResponse.json({success:true,memory,state:await getBlackHoleState(AGENT_ID)});
    }

    if(action==="wake"){
      const acquired=await startBlackHoleThinking(AGENT_ID);
      if(!acquired){
        const state=await getBlackHoleState(AGENT_ID);
        return NextResponse.json({success:false,busy:true,state},{status:409});
      }

      try{
        const run=await runAutopilot({
          agentId:AGENT_ID,
          objective:typeof body?.objective==="string"&&body.objective.trim()
            ? body.objective.trim()
            : "Enter the current Mirror state, observe the stored evidence, and make one bounded evidence-preserving research move. If no move is justified, record that no move is justified.",
          maxCycles:1,
          maxToolSteps:4,
          requestSource:"SCHEDULED"
        });
        const last=run.results?.[run.results.length-1];
        const brain=await getOperationalBrain(AGENT_ID);
        await ingestMirrorMemory(AGENT_ID);
        const state=await finishBlackHoleThinking(AGENT_ID,{
          cycleDelta:Number(run.cyclesCompleted||0),
          thought:String(last?.output||run.results?.[0]?.error||"No new thought was produced.").slice(0,1800),
          action:run.results?.[0]?.phase||"OBSERVE",
          activeNodes:brain.activeNodeIds
        });
        return NextResponse.json({success:true,state,run:{
          sessionId:run.sessionId,
          cyclesCompleted:run.cyclesCompleted,
          steps:last?.steps||0,
          model:last?.activeModel||null
        }});
      }catch(error:any){
        const state=await finishBlackHoleThinking(AGENT_ID,{error:error?.message||String(error)});
        return NextResponse.json({success:false,state,error:error?.message||String(error)},{status:502});
      }
    }

    return NextResponse.json({error:"Unknown action."},{status:400});
  }catch(error:any){
    return NextResponse.json({error:error?.message||String(error)},{status:500});
  }
}
