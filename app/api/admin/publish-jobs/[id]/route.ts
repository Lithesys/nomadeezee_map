import { requireAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await auth.supabase.from("map_publish_jobs").select("*").eq("id", id).single();
  if (error) return Response.json({ error: "Publish job not found" }, { status: 404 });
  return Response.json({ job: data });
}
