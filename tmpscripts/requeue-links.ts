import { createClient } from "@supabase/supabase-js";
import { requeueMissingLinkWork } from "../src/lib/ingest-queue.server";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
console.log(await requeueMissingLinkWork(supabase));
