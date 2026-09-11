import { requireAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await auth.supabase
    .from("map_feature_revisions")
    .select("id,feature_id,name,name_vi,name_en,min_zoom,max_zoom,label_min_zoom,label_priority,version,status,created_by,created_at")
    .eq("feature_id", id)
    .order("version", { ascending: false });
  if (error) return Response.json({ error: "Could not load revisions" }, { status: 500 });
  return Response.json({ revisions: data });
}
