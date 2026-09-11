import { requireAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
