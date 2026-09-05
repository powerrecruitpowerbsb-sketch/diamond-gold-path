import { createClient } from "@supabase/supabase-js";
import { discoverUniversityUrls } from "@/lib/discovery.server";

const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});
const out = await discoverUniversityUrls(supabase, "dc1fdf16-bb76-4756-864b-2287ffe67e2e");
console.log(JSON.stringify(out, null, 2));
