import { createClient } from "@supabase/supabase-js";
import { sweepUnresolvedSchools } from "../src/lib/federal-directory.server";

const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const out = await sweepUnresolvedSchools(supabase, "preview", { apply: false, limit: 400 });
console.log("examined", out.examined, "matched", out.matched);
for (const r of out.results) {
  console.log(r.status.padEnd(9), (r.schoolName + " [" + (r.state ?? "?") + "]").padEnd(50), "->", r.matchedName ?? (r.status === "ambiguous" ? "(needs a human)" : "(nothing)"));
}
