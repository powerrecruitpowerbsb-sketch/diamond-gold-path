import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { webFillBatch } = await import("../src/lib/school-web-fill.server");
const { data: admin } = await supabase.from("users").select("id").eq("user_type", "superadmin").limit(1).single();
const out = await webFillBatch(supabase, admin!.id, { limit: 3 });
console.log(JSON.stringify(out, null, 2));
