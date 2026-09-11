import { z } from "zod";

import { dispatchMapPublish } from "@/lib/map/github";
import { requireAdmin } from "@/lib/supabase/server";

const bodySchema = z.object({ revisionId: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const { id: featureId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await auth.supabase.rpc("request_map_publish", {
    p_feature_id: featureId,
    p_revision_id: parsed.data.revisionId,
    p_requested_by: auth.user.id,
  });
  if (error) return Response.json({ error: error.message }, { status: 409 });

  const job = data as { jobId?: string; releaseId?: string; releaseKey?: string; generation?: number } | null;
  if (!job?.jobId || !job.releaseId || !job.releaseKey || typeof job.generation !== "number") {
    return Response.json({ error: "Publish job was created without complete release metadata" }, { status: 502 });
  }

  try {
    const dispatch = await dispatchMapPublish({
      jobId: job.jobId,
      releaseId: job.releaseId,
      releaseKey: job.releaseKey,
      expectedGeneration: job.generation - 1,
    });
    return Response.json({ ...job, dispatch }, { status: 202 });
  } catch (dispatchError) {
    return Response.json({
      ...job,
      dispatch: { status: "failed", reason: dispatchError instanceof Error ? dispatchError.message : "GitHub dispatch failed" },
    }, { status: 502 });
  }
}
