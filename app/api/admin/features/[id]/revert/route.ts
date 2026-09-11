import { z } from "zod";

import { requireAdmin } from "@/lib/supabase/server";

const bodySchema = z.object({ revisionId: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });

  const { id: featureId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await auth.supabase.rpc("revert_map_feature_revision", {
    p_feature_id: featureId,
    p_revision_id: parsed.data.revisionId,
    p_updated_by: auth.user.id,
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ revision: data });
}
