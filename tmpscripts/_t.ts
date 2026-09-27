import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const rows = readFileSync("/tmp/j/backlog.log","utf8").split("\n").filter(l=>l.startsWith("{")).map(l=>JSON.parse(l));
let got=0; for (const r of rows){ const { count } = await sb.from("roster_players").select("id",{count:"exact",head:true}).eq("program_id",r.id); if(count) got++; }
console.log("processed", rows.length, "now with players", got, JSON.stringify(rows.reduce((a:any,r:any)=>(a[r.status??"err"]=(a[r.status??"err"]??0)+1,a),{})));
