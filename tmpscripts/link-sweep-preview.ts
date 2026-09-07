import { createClient } from "@supabase/supabase-js";
import { sweepLinksUntilDone } from "../src/lib/link-sweep.server";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const apply = process.argv.includes("--apply");
const out = await sweepLinksUntilDone(supabase, null as any, { apply, budgetMs: 40_000, maxPasses: 6 });
console.log(JSON.stringify(out, null, 2));
