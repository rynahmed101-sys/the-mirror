import { neonSql, sqlite, isPg } from "../db";

export type BrainRuntimeNode = {
  activation:number;
  tendency:number;
  confidence:number;
  exposures:number;
  successes:number;
  failures:number;
  predictionError:number;
  lastEvidence:string | null;
  updatedAt:string | null;
};

export type OperationalBrainState = {
  version:number;
  nodes:Record<string,BrainRuntimeNode>;
  updatedAt:string;
};

let ready=false;

async function ensureTable(){
  if(ready) return;
  if(isPg){
    if(!neonSql) throw new Error("Neon SQL runtime unavailable.");
    await neonSql`CREATE TABLE IF NOT EXISTS mirror_brain_state (
      agent_id TEXT PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  } else {
    if(!sqlite) throw new Error("SQLite runtime unavailable.");
    sqlite.exec(`CREATE TABLE IF NOT EXISTS mirror_brain_state (
      agent_id TEXT PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1,
      state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  }
  ready=true;
}

export async function loadBrainState(agentId:string):Promise<OperationalBrainState | null>{
  await ensureTable();
  if(isPg){
    const rows=await neonSql`SELECT version,state,updated_at FROM mirror_brain_state WHERE agent_id=${agentId} LIMIT 1`;
    const row:any=rows?.[0];
    if(!row) return null;
    return {version:Number(row.version||1),nodes:typeof row.state==="string"?JSON.parse(row.state):row.state,updatedAt:new Date(row.updated_at).toISOString()};
  }
  const row:any=sqlite.prepare("SELECT version,state,updated_at FROM mirror_brain_state WHERE agent_id=? LIMIT 1").get(agentId);
  if(!row) return null;
  return {version:Number(row.version||1),nodes:JSON.parse(row.state),updatedAt:new Date(Number(row.updated_at)).toISOString()};
}

export async function saveBrainState(agentId:string,state:OperationalBrainState):Promise<void>{
  await ensureTable();
  if(isPg){
    await neonSql`INSERT INTO mirror_brain_state(agent_id,version,state,updated_at)
      VALUES(${agentId},${state.version},${JSON.stringify(state.nodes)}::jsonb,NOW())
      ON CONFLICT(agent_id) DO UPDATE SET version=EXCLUDED.version,state=EXCLUDED.state,updated_at=NOW()`;
    return;
  }
  sqlite.prepare(`INSERT INTO mirror_brain_state(agent_id,version,state,updated_at)
    VALUES(?,?,?,?)
    ON CONFLICT(agent_id) DO UPDATE SET version=excluded.version,state=excluded.state,updated_at=excluded.updated_at`)
    .run(agentId,state.version,JSON.stringify(state.nodes),Date.now());
}
