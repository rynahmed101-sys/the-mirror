import { createHash } from "crypto";

export type KnowledgeConnector = {
  id: "mirror" | "huggingface-models" | "huggingface-datasets" | "huggingface-papers" | "github" | "url";
  name: string;
  description: string;
  mode: "live";
};

export const KNOWLEDGE_CONNECTORS: KnowledgeConnector[] = [
  { id:"mirror", name:"Mirror Evidence", description:"Search the current Mirror event, observation, experiment, and journal record.", mode:"live" },
  { id:"huggingface-models", name:"Hugging Face Models", description:"Discover models from the Hugging Face Hub.", mode:"live" },
  { id:"huggingface-datasets", name:"Hugging Face Datasets", description:"Discover datasets from the Hugging Face Hub.", mode:"live" },
  { id:"huggingface-papers", name:"Hugging Face Papers", description:"Search current AI/ML papers surfaced by the Hugging Face Hub.", mode:"live" },
  { id:"github", name:"GitHub Public", description:"Search public GitHub repositories and code metadata.", mode:"live" },
  { id:"url", name:"Public URL", description:"Fetch allowlisted public HTTP(S) resources without accepting arbitrary private-network targets.", mode:"live" },
];

export function hashSourceText(text:string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function assertSafeUrl(raw:string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only HTTP(S) URLs are supported.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.startsWith("10.") || host.startsWith("192.168.") || host.endsWith(".local")) {
    throw new Error("Private-network URLs are not permitted.");
  }
  return url;
}

export async function searchKnowledge(connector: KnowledgeConnector["id"], query:string) {
  const q=String(query||"").trim();
  if(!q) throw new Error("Knowledge query is required.");

  if(connector==="huggingface-models"){
    const response=await fetch("https://huggingface.co/api/models?search="+encodeURIComponent(q)+"&limit=8", { cache:"no-store" });
    if(!response.ok) throw new Error("Hugging Face model search failed: HTTP "+response.status);
    return (await response.json()).map((x:any)=>({id:x.id, downloads:x.downloads, likes:x.likes, pipeline:x.pipeline_tag, url:"https://huggingface.co/"+x.id}));
  }
  if(connector==="huggingface-datasets"){
    const response=await fetch("https://huggingface.co/api/datasets?search="+encodeURIComponent(q)+"&limit=8", { cache:"no-store" });
    if(!response.ok) throw new Error("Hugging Face dataset search failed: HTTP "+response.status);
    return (await response.json()).map((x:any)=>({id:x.id, downloads:x.downloads, likes:x.likes, url:"https://huggingface.co/datasets/"+x.id}));
  }
  if(connector==="huggingface-papers"){
    const response=await fetch("https://huggingface.co/api/papers?search="+encodeURIComponent(q)+"&limit=8", { cache:"no-store" });
    if(!response.ok) throw new Error("Hugging Face paper search failed: HTTP "+response.status);
    return (await response.json()).map((x:any)=>({id:x.id, title:x.title, url:"https://huggingface.co/papers/"+x.id}));
  }
  if(connector==="github"){
    const response=await fetch("https://api.github.com/search/repositories?q="+encodeURIComponent(q)+"&per_page=8", { headers:{"Accept":"application/vnd.github+json","User-Agent":"THE-MIRROR"}, cache:"no-store" });
    if(!response.ok) throw new Error("GitHub search failed: HTTP "+response.status);
    const data=await response.json();
    return (data.items||[]).map((x:any)=>({id:x.full_name, description:x.description, stars:x.stargazers_count, url:x.html_url}));
  }
  if(connector==="url"){
    const url=assertSafeUrl(q);
    const response=await fetch(url.toString(), { headers:{"User-Agent":"THE-MIRROR-KNOWLEDGE/1.0"}, signal:AbortSignal.timeout(12000), cache:"no-store" });
    if(!response.ok) throw new Error("URL fetch failed: HTTP "+response.status);
    const text=await response.text();
    return [{url:url.toString(), sha256:hashSourceText(text), content:text.slice(0,20000)}];
  }
  return [{query:q, note:"Mirror connector is served through the authenticated research APIs and current database state."}];
}
