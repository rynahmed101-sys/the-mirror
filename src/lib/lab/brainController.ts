import { createOperationalBrain96, type BrainNode96 } from "./brain96";
import { loadBrainState, saveBrainState, type BrainRuntimeNode, type OperationalBrainState } from "./brainStateStore";
import { db, isPg } from "../db";
import * as sqliteSchema from "../db/schema";
import * as pgSchema from "../db/schema.pg";

const DEF=createOperationalBrain96();
const tables:any=isPg?pgSchema:sqliteSchema;
const { experiments }=tables;
const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
const tokenize=(x:string)=>new Set(String(x||"").toLowerCase().split(/[^a-z0-9-]+/).filter(t=>t.length>2));

const LEFT_KEYS=new Set(["CH01_PRE_ACTION","CH05_PREDICTION_LEDGER","CH06_CALIBRATION","CH07_TOOL_SIMULATION","CH08_EXECUTION_CHAMBER","CH09_ERROR_LOCALIZATION","CH10_SELF_MODEL","CH11_MEMORY"]);

function seedNode(node:BrainNode96):BrainRuntimeNode{
  const initial=LEFT_KEYS.has(node.column)?-0.05:0.05;
  return {activation:0,tendency:initial,confidence:0,exposures:0,successes:0,failures:0,predictionError:0,lastEvidence:null,updatedAt:null};
}

function freshState(seed?:Map<string,{exposures:number;successes:number;failures:number;confidence:number;tendency:number;predictionError:number;lastEvidence:string|null}>):OperationalBrainState{
  const nodes:Record<string,BrainRuntimeNode>={};
  for(const node of DEF.nodes){
    const measured=seed?.get(node.column);
    if(measured){
      nodes[node.id]={activation:0,...measured,updatedAt:new Date().toISOString()};
    }else{
      nodes[node.id]=seedNode(node);
    }
  }
  return {version:1,nodes,updatedAt:new Date().toISOString()};
}

function parseResult(row:any){
  try{
    const r=typeof row.results==="string"?JSON.parse(row.results):row.results;
    const trial=String(r?.trialKey||"");
    const comparison=r?.comparison||{};
    if(!trial.startsWith("CH")||!comparison) return null;
    return {trial,actual:Boolean(comparison.actual),realityGap:Number(comparison.realityGap||0),calibrated:Boolean(comparison.calibrated),id:String(row.id)};
  }catch{return null;}
}

async function seedFromObservedHistory():Promise<Map<string,{exposures:number;successes:number;failures:number;confidence:number;tendency:number;predictionError:number;lastEvidence:string|null}>>{
  const rows=await db.select().from(experiments).where((q:any)=>q);
  const groups=new Map<string,any[]>();
  for(const row of rows.map(parseResult).filter(Boolean) as any[]){
    if(!/^CH(0[1-9]|1[0-9]|20)_/.test(row.trial)) continue;
    const key=row.trial as string;
    const arr=groups.get(key)||[]; arr.push(row); groups.set(key,arr);
  }
  const out=new Map<string,any>();
  for(const [key,arr] of groups){
    const success=arr.filter(x=>x.actual).length;
    const rate=success/Math.max(1,arr.length);
    const gap=arr.reduce((n,x)=>n+x.realityGap,0)/Math.max(1,arr.length);
    const calibratedRate=arr.filter(x=>x.calibrated).length/Math.max(1,arr.length);
    const error=Number(Math.min(1,Math.abs(1-rate)+gap*0.5).toFixed(4));
    const score=Number(Math.max(-1,Math.min(1,(rate-0.5)*1.4-gap)).toFixed(4));
    out.set(key,{exposures:arr.length,successes:success,failures:arr.length-success,confidence:Number((rate*(1-gap)).toFixed(4)),tendency:score,predictionError:error,lastEvidence:arr[arr.length-1]?.id||key});
    void calibratedRate;
  }
  return out;
}

async function getState(agentId:string){
  const stored=await loadBrainState(agentId);
  if(stored) return stored;
  const observed=await seedFromObservedHistory().catch(()=>new Map());
  const created=freshState(observed);
  await saveBrainState(agentId,created);
  return created;
}

function scoreNode(node:BrainNode96,state:OperationalBrainState,intent:Set<string>){
  const keywordHits=node.keywords.filter(k=>intent.has(k.toLowerCase())).length;
  const partial=node.keywords.filter(k=>[...intent].some(t=>k.toLowerCase().includes(t)||t.includes(k.toLowerCase()))).length;
  const learned=state.nodes[node.id]?.tendency||0;
  const confidence=state.nodes[node.id]?.confidence||0;
  return keywordHits*1.5+partial*0.25+Math.abs(learned)*0.1+confidence*0.1;
}

export async function activateOperationalBrain(agentId:string,input:string){
  const state=await getState(agentId);
  const intent=tokenize(input);
  const ranked=DEF.nodes.map(node=>({...node,score:scoreNode(node,state,intent)}))
    .sort((a,b)=>b.score-a.score||a.index-b.index);
  const active=ranked.slice(0,8);
  for(const node of active){
    const runtime=state.nodes[node.id];
    runtime.activation=Number(clamp(runtime.activation*0.7+0.3).toFixed(4));
    runtime.exposures+=1;
    runtime.updatedAt=new Date().toISOString();
  }
  state.version+=1;
  state.updatedAt=new Date().toISOString();
  await saveBrainState(agentId,state);
  return {
    state,
    activeNodeIds:active.map(x=>x.id),
    activeNodes:active.map(x=>({id:x.id,label:x.label,layer:x.layer,hemisphere:x.hemisphere,tendency:Number(state.nodes[x.id].tendency.toFixed(4)),confidence:Number(state.nodes[x.id].confidence.toFixed(4))})),
    systemInstruction:[
      "OPERATIVE BRAIN96 ROUTING:",
      "The model is the language engine; Brain96 is the persistent controller state.",
      "Use the active behavioral modules below to decide what evidence, memory, prediction, tools, and action discipline matter.",
      "Do not expose hidden reasoning. Return only conclusions, evidence, uncertainties, and observable actions.",
      active.map(x=>x.layer+"/"+x.label+" ["+x.hemisphere+"]").join(", ")
    ].join("\n")
  };
}

export async function learnFromChamberOutcome(agentId:string,args:{
  trialKey:string;
  actual:boolean;
  realityGap:number;
  calibrated:boolean;
  evidenceRef?:string;
}){
  const state=await getState(agentId);
  const affected=DEF.nodes.filter(n=>n.column===args.trialKey);
  if(!affected.length) return {updated:0,reason:"trial-not-mapped"};
  const outcome=args.actual ? 1 : -1;
  const quality=args.actual ? clamp(1-Number(args.realityGap||0)) : -1;
  for(const node of affected){
    const runtime=state.nodes[node.id];
    runtime.exposures+=1;
    if(args.actual) runtime.successes+=1; else runtime.failures+=1;
    runtime.confidence=Number(clamp(runtime.confidence*0.85+Math.max(0,quality)*0.15).toFixed(4));
    runtime.predictionError=Number(clamp(runtime.predictionError*0.8+Math.abs((args.calibrated?0:1)-(args.actual?0:1))*0.2).toFixed(4));
    runtime.tendency=Number(clamp(runtime.tendency+outcome*0.025,-1,1).toFixed(4));
    runtime.lastEvidence=args.evidenceRef||args.trialKey;
    runtime.updatedAt=new Date().toISOString();
  }
  state.version+=1;
  state.updatedAt=new Date().toISOString();
  await saveBrainState(agentId,state);
  return {updated:affected.length,trialKey:args.trialKey,actual:args.actual,realityGap:args.realityGap,causalStatus:"FUNCTIONAL_COMPETENCE_UPDATE_NOT_NODE_CAUSALITY"};
}

export async function getOperationalBrain(agentId:string){
  const state=await getState(agentId);
  return {definition:DEF,state,summary:{
    total:96,
    left:DEF.nodes.filter(n=>n.hemisphere==="left").length,
    right:DEF.nodes.filter(n=>n.hemisphere==="right").length,
    active:DEF.nodes.filter(n=>state.nodes[n.id].activation>0.05).length,
    trained:DEF.nodes.filter(n=>state.nodes[n.id].exposures>0).length,
    version:state.version,
    status:"OPERATIVE"
  }};
}
