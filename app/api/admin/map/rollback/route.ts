import { z } from "zod";

import { requireAdmin } from "@/lib/supabase/server";

const bodySchema = z.object({ releaseId: z.string().uuid(), expectedGeneration: z.number().int().nonnegative() });

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await auth.supabase.rpc("rollback_map_release", {
    p_release_id: parsed.data.releaseId,
    p_expected_generation: parsed.data.expectedGeneration,
    p_actor: auth.user.id,
  });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json(data);
}
