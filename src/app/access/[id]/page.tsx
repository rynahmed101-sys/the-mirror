import Link from "next/link";

export default async function AccessPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <main className="min-h-dvh bg-[#050505] p-6 text-zinc-100"><div className="mx-auto max-w-xl pt-20"><div className="rounded-3xl border border-red-500/20 bg-[#0b0b0d] p-7 shadow-2xl"><div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-600">THE MIRROR · ACCESS CAPABILITY</div><h1 className="mt-3 text-2xl font-semibold">External laboratory link</h1><p className="mt-3 text-sm leading-6 text-zinc-500">This URL is a scoped machine capability. The GET view describes its current scope. Laboratory actions remain POST requests and are validated server-side.</p><div className="mt-5 rounded-2xl border border-white/[0.06] bg-black p-4 font-mono text-xs text-zinc-400">/api/agent/access/{id}</div><Link href={"/api/agent/access/"+encodeURIComponent(id)} className="mt-5 inline-flex rounded-xl bg-red-700 px-4 py-2.5 text-xs font-semibold">Inspect capability</Link></div></div></main>
}
