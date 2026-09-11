import { randomUUID } from "node:crypto";

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
  const { data, error } = await supabase.rpc("start_map_publish_job", {
    p_job_id: required("JOB_ID"),
    p_lease_token: randomUUID(),
  });
  if (error) throw new Error(`Could not start publish job: ${error.message}`);
  console.log(JSON.stringify(data));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
