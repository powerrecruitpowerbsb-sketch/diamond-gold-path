/** Pre-flight: mix-up cleanup + backlog sweep. Run: bun tmpscripts/preflight.ts [--apply] */
import { createClient } from "@supabase/supabase-js";
import { auditPageOwnership } from "../src/lib/completion.server";

const apply = process.argv.includes("--apply");
const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const own = await auditPageOwnership(supabase, { apply });
console.log("ownership:", { checked: own.checked, problems: own.problems.length, cleared: own.cleared });
for (const p of own.problems.slice(0, 15)) console.log("  ", p.schoolName, p.sport, p.domain, "kept by", p.keptBy, p.fields.join(","));
