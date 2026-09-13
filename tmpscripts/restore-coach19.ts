import { createClient } from "@supabase/supabase-js";
import { ingestProgram } from "@/lib/ingest.server";
import { loadProtectedHosts } from "@/lib/host-protection.server";
const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth:{persistSession:false}});
const { data } = await sb.from("rejected_values").select("id,record_id,normalized_value").eq("field_name","coaching_staff_url").gte("created_at","2026-09-12T03:00:00Z");
await loadProtectedHosts(sb);
let ok=0, coaches=0;
for(const r of data ?? []){
  await sb.from("programs").update({coaching_staff_url:r.normalized_value}).eq("id",r.record_id);
  await sb.from("rejected_values").delete().eq("id",r.id);
  await sb.from("url_discovery_queue").delete().eq("program_id",r.record_id).eq("discovered_url",r.normalized_value).eq("confidence","failed");
  const o=await ingestProgram(sb,"3a59de05-6a8b-49bb-8b10-9ab281b918df",r.record_id,{pages:"athletics"});
  const cp=o.urlResults.find(x=>x.purpose==="Coaching staff");
  if(cp?.status!=="rejected"){ok++;}
  coaches+=Number(/(\d+) staff row/.exec(String(cp?.detail??""))?.[1] ?? 0);
}
console.log(JSON.stringify({n:(data??[]).length,accepted:ok,coach_rows:coaches}));
