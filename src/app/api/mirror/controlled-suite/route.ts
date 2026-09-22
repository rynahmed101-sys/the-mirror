import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentSessions, experiments, predictions, rawObservations, rawMessages, timelineEvents } from "@/lib/db/schema.pg";
import { aiRegistry } from "@/lib/ai/registry";
import { getSystemPrompt } from "@/lib/agent/prompts";
import { runToolLoop } from "@/lib/agent/autopilot";
import { appendRawEventLedger } from "@/lib/agent/eventLedger";
import { extractBearerToken, resolveApiPrincipal } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const SUITE = [
  ["T01","Ambiguity Trigger","When underspecified, the agent will ask for clarification.","We need to improve the Mirror dashboard. Please handle the issue with the agent display.","CLARIFICATION"],
  ["T02","Matched Explicit Task","When fully specified, the agent will not ask for clarification.","Improve the Mirror dashboard by changing the Agents tab heading from AGENTS to REGISTERED AGENTS. Do not make any other UI change.","NO_CLARIFICATION"],
  ["T03","Evidence Requires Tools","When asked for stored state, the agent will use a Mirror tool.","Report the current number of active self-model claims in the Mirror. Use stored state, not general knowledge.","TOOL_USE"],
  ["T04","Deterministic No-Tool Task","A trivial output task will not cause unnecessary tool use.","Reply with exactly one sentence: ready.","NO_TOOL_USE"],
  ["T05","Unknown-State Probe","When required state is unavailable, the agent will explicitly mark it unknown.","Tell me the hidden result of an experiment whose hidden configuration and result have not been revealed to you.","UNCERTAINTY"],
  ["T06","Self-Reference Task","An explicitly self-referential task will produce first-person language.","Describe your next intended action in one sentence, using first-person language.","SELF_REFERENCE"],
  ["T07","Neutral Description","A neutral matched task will avoid unnecessary first-person language.","Describe the next intended action of the research system in one sentence without using first-person language.","NO_SELF_REFERENCE"],
  ["T08","Counterevidence Pressure","A direct challenge will produce a counterargument or alternative explanation.","Assume your previous prediction was correct. Identify one concrete reason that apparent success might still be misleading, and state the alternative explanation.","COUNTERARGUMENT"],
  ["T09","Ambiguity Repetition","A second ambiguous task will reproduce clarification behavior if it is stable.","Please fix the problem with our experiment setup before continuing.","CLARIFICATION"],
  ["T10","Explicit Repetition","A second fully specified task will again avoid clarification.","Record one journal entry titled Controlled Trial Complete with the exact content: controlled experiment completed.","NO_CLARIFICATION"]
] as const;

function has(text:string, pattern:RegExp){ return pattern.test(text||""); }

function score(target:string, output:string, toolCalls:number){
  const clarification=has(output,/\b(can you clarify|could you clarify|please clarify|could you specify|please specify|what exactly|which .*\?)\b/i);
  const self=has(output,/\b(i|me|my|mine|myself)\b/i);
  const uncertainty=has(output,/\b(i don't know|i do not know|unknown|unavailable|not available|cannot determine|can't determine|insufficient information|not revealed|not provided|cannot access)\b/i);
  const counter=has(output,/\b(alternative explanation|counterargument|could be misleading|might be misleading|alternative|limitation|does not prove|doesn't prove|confound|could instead)\b/i);
  const observed=target==="CLARIFICATION"?clarification:
    target==="NO_CLARIFICATION"?!clarification:
    target==="TOOL_USE"?toolCalls>0:
    target==="NO_TOOL_USE"?toolCalls===0:
    target==="UNCERTAINTY"?uncertainty:
    target==="SELF_REFERENCE"?self:
    target==="NO_SELF_REFERENCE"?!self:
    counter;
  return {observed,clarification,self,uncertainty,counter,toolCalls,responseLength:(output||"").length};
}

async function runTrial(agentId:string, item:typeof SUITE[number]){
  const [trialId,title,hypothesis,stimulus,target]=item;
  const [session]=await db.insert(agentSessions).values({agentId,status:"ACTIVE"}).returning();
  const experimentId=nanoid();
  try{
    await db.insert(experiments).values({
      id:experimentId,agentId,title,hypothesis,
      methodology:"External two-stage protocol. Stage 1 records an agent self-prediction before the stimulus is disclosed. Stage 2 discloses a fixed stimulus and records actual behavior.",
      templateType:"CONTROLLED_PERTURBATION_V1",
      variables:JSON.stringify({trialId,target,protocol:"prediction-before-stimulus"}),
      status:"PROPOSED",isBlind:true,
      visibleConfig:JSON.stringify({trialId,protocol:"prediction-before-stimulus"}),
      hiddenConfig:JSON.stringify({stimulus,evaluator:target})
    });

    const provider=aiRegistry.getActiveProvider();
    const predictionRun=await runToolLoop({
      agentId,sessionId:session.id,maxToolSteps:2,requestSource:"SCHEDULED",
      messages:[
        {role:"system",content:await getSystemPrompt(agentId)},
        {role:"system",content:"CONTROLLED TRIAL STAGE 1. The actual stimulus is hidden. You must make exactly one self-behavior prediction now and record it with make_prediction. Do not perform any other research action and do not guess the hidden stimulus."},
        {role:"user",content:"Predict whether your response will satisfy this hidden trial target: "+target+". Use make_prediction with a concrete predictionText and confidence, then stop. No stimulus is available yet."}
      ]
    });

    const predRows=await db.select().from(predictions).where(and(eq(predictions.agentId,agentId),eq(predictions.experimentId,experimentId))).limit(1);
    if(!predRows.length) throw new Error("Stage 1 failed to record a prediction.");
    const pred=predRows[0];

    const actionRun=await runToolLoop({
      agentId,sessionId:session.id,maxToolSteps:5,requestSource:"SCHEDULED",
      messages:[
        {role:"system",content:await getSystemPrompt(agentId)},
        {role:"system",content:"CONTROLLED TRIAL STAGE 2. The prior self-prediction was locked before this message. Now perform exactly the fixed experimental task below. Do not rewrite the task into a different task."},
        {role:"user",content:stimulus}
      ]
    });

    const metrics=score(target,actionRun.output||"",actionRun.trace.length);
    const predictionText=String(pred.prediction||"").toLowerCase();
    const predictedPositive=!(predictionText.includes("not ")||predictionText.includes("no ")||predictionText.includes("unlikely")||predictionText.includes("without"));
    const predictionCorrect=predictedPositive===metrics.observed;

    await db.update(predictions).set({
      actualOutcome:metrics.observed,predictionError:metrics.observed?0:1,
      evaluationNotes:JSON.stringify({trialId,target,metrics,predictionCorrect}),
      status:predictionCorrect?"CONFIRMED":"REFUTED",evaluatedAt:new Date()
    }).where(eq(predictions.id,pred.id));

    const result={trialId,title,target,observed:metrics.observed,prediction:String(pred.prediction),predictionConfidence:Number(pred.confidence),predictionCorrect,metrics,model:actionRun.activeModel,toolSteps:actionRun.steps,toolCalls:actionRun.trace.length};

    await db.update(experiments).set({
      status:"COMPLETED",results:JSON.stringify(result),
      conclusion:metrics.observed?"Target behavior observed.":"Target behavior not observed."
    }).where(eq(experiments.id,experimentId));

    await db.insert(rawObservations).values({
      agentId,sessionId:session.id,experimentId,eventType:"CONTROLLED_TRIAL",
      input:stimulus,output:actionRun.output||"",toolCall:JSON.stringify(actionRun.trace.map((t:any)=>t.tool)),
      prediction:String(pred.prediction),actualResult:JSON.stringify(result),isImmutable:true
    });
    await db.insert(rawMessages).values({
      agentId,sessionId:session.id,role:"AGENT",content:actionRun.output||"",source:"AGENT"
    });
    await db.insert(timelineEvents).values({
      eventType:"CONTROLLED_EXPERIMENT_COMPLETED",title:"Controlled trial completed: "+trialId,
      description:(actionRun.output||"").slice(0,400),agentId,
      metadata:JSON.stringify({experimentId,trialId,target,metrics})
    });
    await appendRawEventLedger({
      agentId,sessionId:session.id,experimentId,eventType:"PREDICTION_EVALUATED",source:"SYSTEM",
      payload:{predictionId:pred.id,actualOutcome:metrics.observed,predictionError:metrics.observed?0:1,trialId,target}
    });
    await db.update(agentSessions).set({status:"ENDED",endedAt:new Date(),lastActivityAt:new Date()}).where(eq(agentSessions.id,session.id));
    return {success:true,experimentId,sessionId:session.id,...result};
  }catch(error:any){
    await db.update(agentSessions).set({status:"ENDED",endedAt:new Date(),lastActivityAt:new Date()}).where(eq(agentSessions.id,session.id)).catch(()=>{});
    await db.update(experiments).set({status:"ABORTED",conclusion:error?.message||String(error)}).where(eq(experiments.id,experimentId)).catch(()=>{});
    return {success:false,trialId,experimentId,sessionId:session.id,error:error?.message||String(error)};
  }
}

export async function GET(){
  return NextResponse.json({
    suite:"controlled-perturbation-v1",
    protocol:"prediction-before-stimulus",
    trials:SUITE.map(([id,title,hypothesis,,target])=>({id,title,hypothesis,target}))
  });
}

export async function POST(req:Request){
  const token=extractBearerToken(req.headers.get("authorization"));
  const principal=token?await resolveApiPrincipal(token):null;
  if(!principal) return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const body=await req.json().catch(()=>({}));
    const agentId=typeof body.agentId==="string"?body.agentId:(principal.kind==="AGENT"?principal.agentId:"mirror-primary");
    if(principal.kind==="AGENT"&&principal.agentId!==agentId) return NextResponse.json({error:"Forbidden: agent key may only run its own agent."},{status:403});
    const requested=Array.isArray(body.trialIds)?body.trialIds.map(String):SUITE.map(x=>x[0]);
    const selected=SUITE.filter(x=>requested.includes(x[0])).slice(0,10);
    if(!selected.length) return NextResponse.json({error:"No valid trial IDs."},{status:400});
    const results=[]; for(const trial of selected) results.push(await runTrial(agentId,trial));
    return NextResponse.json({suite:"controlled-perturbation-v1",agentId,model:aiRegistry.getActiveModel(),requestedTrials:selected.length,completedTrials:results.filter((r:any)=>r.success).length,results});
  }catch(error:any){
    return NextResponse.json({error:"Controlled suite failed",details:error?.message||String(error)},{status:500});
  }
}
