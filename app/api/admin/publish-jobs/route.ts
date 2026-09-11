import { requireAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const { data, error } = await auth.supabase
    .from("map_publish_jobs")
    .select("id,release_id,status,attempts,github_run_id,error_code,error_message,created_at,started_at,finished_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return Response.json({ error: "Could not load publish jobs" }, { status: 500 });
  return Response.json({ jobs: data });
}
