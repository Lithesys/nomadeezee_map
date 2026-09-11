import { createClient } from "@supabase/supabase-js";

async function main() {
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const result = await supabase.rpc("mark_map_publish_failed", {
  p_job_id: process.env.JOB_ID,
  p_error_code: process.env.ERROR_CODE ?? "BUILD_FAILED",
  p_error_message: (process.env.ERROR_MESSAGE ?? "Tile build failed").slice(0, 2000),
});
if (result.error) throw new Error(result.error.message);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
