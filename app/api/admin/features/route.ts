import { z } from "zod";

import { requireAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const featureTypes = ["country", "province", "district", "city", "area", "island", "neighbourhood"] as const;

const createSchema = z.object({
  feature_type: z.enum(featureTypes),
  name: z.string().trim().min(1).max(200),
  name_vi: z.string().trim().max(200).nullable().optional(),
  name_en: z.string().trim().max(200).nullable().optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  geometry: z.unknown().nullable().optional(),
  label_point: z.unknown().nullable().optional(),
  min_zoom: z.number().int().min(0).max(24).optional(),
  max_zoom: z.number().int().min(0).max(24).optional(),
  label_min_zoom: z.number().int().min(0).max(24).optional(),
  label_priority: z.number().int().min(-10000).max(10000).optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });

  const { data, error } = await auth.supabase
    .from("map_features")
    .select("id,feature_type,name,name_vi,name_en,slug,min_zoom,max_zoom,label_min_zoom,label_priority,status,version,updated_at")
    .order("feature_type")
    .order("name");
  if (error) return Response.json({ error: "Could not load map features" }, { status: 500 });
  return Response.json({ features: data });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const input = parsed.data;
  const { data, error } = await auth.supabase.rpc("create_map_feature_draft", {
    p_feature_type: input.feature_type,
    p_name: input.name,
    p_slug: input.slug,
    p_name_vi: input.name_vi ?? null,
    p_name_en: input.name_en ?? null,
    p_geometry: input.geometry ?? null,
    p_label_point: input.label_point ?? null,
    p_min_zoom: input.min_zoom ?? 0,
    p_max_zoom: input.max_zoom ?? 14,
    p_label_min_zoom: input.label_min_zoom ?? 5,
    p_label_priority: input.label_priority ?? 0,
    p_created_by: auth.user.id,
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ feature: data }, { status: 201 });
}
