import { requireAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });

  const [releasesResult, channelResult] = await Promise.all([
    auth.supabase
      .from("map_releases")
      .select("id,release_key,generation,parent_release_id,status,world_version,vietnam_version,geo_version,style_version,glyphs_version,created_at,activated_at,failure_reason")
      .order("generation", { ascending: false })
      .limit(50),
    auth.supabase.from("map_channel").select("active_release_id,generation").eq("channel", "production").single(),
  ]);

  if (releasesResult.error || channelResult.error) {
    return Response.json({ error: "Could not load map releases" }, { status: 500 });
  }

  return Response.json({
    releases: releasesResult.data ?? [],
    activeReleaseId: channelResult.data.active_release_id,
    generation: channelResult.data.generation,
  });
}
