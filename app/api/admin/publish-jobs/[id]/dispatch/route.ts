import { requireAdmin } from "@/lib/supabase/server";
import { dispatchMapPublish } from "@/lib/map/github";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const { id } = await context.params;

  const { data: job, error } = await auth.supabase
    .from("map_publish_jobs")
    .select("id,release_id,status,map_releases!inner(release_key,generation)")
    .eq("id", id)
    .single();
  if (error || !job) return Response.json({ error: "Publish job not found" }, { status: 404 });
  if (!["queued", "failed"].includes(job.status)) {
    return Response.json({ error: "Only queued or failed jobs can be dispatched" }, { status: 409 });
  }

  const release = Array.isArray(job.map_releases) ? job.map_releases[0] : job.map_releases;
  if (!release) return Response.json({ error: "Publish release not found" }, { status: 404 });

  try {
    const dispatch = await dispatchMapPublish({
      jobId: job.id,
      releaseId: job.release_id,
      releaseKey: release.release_key,
      expectedGeneration: Number(release.generation) - 1,
    });
    return Response.json({ dispatch }, { status: 202 });
  } catch (dispatchError) {
    return Response.json({ error: dispatchError instanceof Error ? dispatchError.message : "GitHub dispatch failed" }, { status: 502 });
  }
}
