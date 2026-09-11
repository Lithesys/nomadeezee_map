import { createClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const releaseId = required("RELEASE_ID");
const jobId = required("JOB_ID");
const expectedGeneration = Number(required("EXPECTED_GENERATION"));
const actor = required("MAP_ACTOR_ID");

const ready = await supabase.rpc("mark_map_release_ready", { p_release_id: releaseId, p_job_id: jobId });
if (ready.error) throw new Error(`Could not mark release ready: ${ready.error.message}`);
const activated = await supabase.rpc("activate_map_release", {
  p_release_id: releaseId,
  p_expected_generation: expectedGeneration,
  p_actor: actor,
});
if (activated.error) throw new Error(`Could not activate release: ${activated.error.message}`);
console.log(JSON.stringify(activated.data));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
