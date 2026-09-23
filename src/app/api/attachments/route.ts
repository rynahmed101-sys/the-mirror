import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { ensureGuestAgent } from "@/lib/auth/experimentalActor";

const MAX_BYTES=16*1024*1024;
const supabaseUrl=process.env.SUPABASE_URL?.replace(/\/$/,"");
const serviceKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;

export const runtime="nodejs";

export async function POST(req:Request){
  const principal=await resolveRequestPrincipal(req);
  if(!principal) return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!supabaseUrl||!serviceKey) return NextResponse.json({error:"Attachment storage is not configured on this deployment."},{status:503});
  const form=await req.formData();
  const file=form.get("file");
  if(!(file instanceof File)) return NextResponse.json({error:"file is required"},{status:400});
  if(file.size>MAX_BYTES) return NextResponse.json({error:"File exceeds 16 MB limit."},{status:413});
  const agentId=principal.kind==="AGENT"?principal.agentId:principal.kind==="TEMP_EXTERNAL"?"agent_guest_"+principal.tokenId:"mirror-primary";
  if(principal.kind==="TEMP_EXTERNAL") await ensureGuestAgent(agentId);
  const bytes=Buffer.from(await file.arrayBuffer());
  const {createHash}=await import("crypto");
  const sha256=createHash("sha256").update(bytes).digest("hex");
  const path=agentId+"/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const headers={apikey:serviceKey,Authorization:"Bearer "+serviceKey,"Content-Type":file.type||"application/octet-stream","x-upsert":"false"};
  const upload=await fetch(supabaseUrl+"/storage/v1/object/mirror-attachments/"+path.split("/").map(encodeURIComponent).join("/"),{method:"POST",headers,body:bytes,cache:"no-store"});
  if(!upload.ok) return NextResponse.json({error:"Attachment upload failed: "+(await upload.text()).slice(0,300)},{status:502});
  const metadata={filename:file.name,contentType:file.type||"application/octet-stream",byteSize:file.size,sha256};
  const row=await fetch(supabaseUrl+"/rest/v1/mirror_attachments",{method:"POST",headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({agent_id:agentId,session_id:null,filename:file.name,content_type:file.type||"application/octet-stream",byte_size:file.size,storage_path:path,sha256,metadata}),cache:"no-store"});
  if(!row.ok) return NextResponse.json({error:"Attachment metadata write failed."},{status:502});
  return NextResponse.json({success:true,attachment:(await row.json())?.[0]||metadata});
}
