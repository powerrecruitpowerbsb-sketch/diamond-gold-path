import { createClient } from "@supabase/supabase-js";
import { ingestProgram } from "@/lib/ingest.server";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data } = await sb.from("programs").select("id").eq("roster_url","https://www.mcceagles.com/sports/sball/2025-26/roster").single();
const o = await ingestProgram(sb, "3a59de05-6a8b-49bb-8b10-9ab281b918df", data!.id, { pages: "athletics" });
console.log(JSON.stringify({ ...o, urlResults: o.urlResults.map((u:any)=>({url:u.url,purpose:u.purpose,status:u.status,detail:String(u.detail??u.error??"").slice(0,200)})) }, null, 1));
