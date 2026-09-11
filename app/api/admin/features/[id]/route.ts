import { z } from "zod";

import { requireAdmin } from "@/lib/supabase/server";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  name_vi: z.string().trim().max(200).nullable().optional(),
  name_en: z.string().trim().max(200).nullable().optional(),
  min_zoom: z.number().int().min(0).max(24).optional(),
  max_zoom: z.number().int().min(0).max(24).optional(),
  label_min_zoom: z.number().int().min(0).max(24).optional(),
  label_priority: z.number().int().min(-10000).max(10000).optional(),
  geometry: z.unknown().nullable().optional(),
  label_point: z.unknown().nullable().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await auth.supabase.from("map_features").select("*").eq("id", id).single();
  if (error) return Response.json({ error: "Feature not found" }, { status: 404 });
  return Response.json({ feature: data });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { geometry, label_point: labelPoint, ...fields } = parsed.data;
  const { data, error } = await auth.supabase.rpc("save_map_feature_draft", {
    p_feature_id: id,
    p_name: fields.name,
    p_name_vi: fields.name_vi,
    p_name_en: fields.name_en,
    p_geometry: geometry ?? null,
    p_label_point: labelPoint ?? null,
    p_min_zoom: fields.min_zoom,
    p_max_zoom: fields.max_zoom,
    p_label_min_zoom: fields.label_min_zoom,
    p_label_priority: fields.label_priority,
    p_updated_by: auth.user.id,
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ revision: data });
}
