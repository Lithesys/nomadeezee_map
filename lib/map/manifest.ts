import { serverEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_RELEASE_ID,
  DEFAULT_RELEASE_KEY,
  mapAssetUrl,
  type MapManifest,
  type MapReleaseRecord,
} from "@/lib/map/types";

function fallbackManifest(): MapManifest {
  const base = serverEnv("NEXT_PUBLIC_MAP_TILES_BASE_URL") ?? "https://tiles.map.nomadeezee.com";
  const releaseKey = serverEnv("NEXT_PUBLIC_MAP_DEFAULT_RELEASE") ?? DEFAULT_RELEASE_KEY;
  const generation = Number(serverEnv("NEXT_PUBLIC_MAP_DEFAULT_GENERATION") ?? "0");
  return {
    channel: "production",
    generation: Number.isFinite(generation) ? generation : 0,
    releaseId: DEFAULT_RELEASE_ID,
    releaseKey,
    createdAt: new Date(0).toISOString(),
    sources: {
      world: mapAssetUrl(base, releaseKey, "world.pmtiles"),
      vietnam: mapAssetUrl(base, releaseKey, "vietnam.pmtiles"),
      geo: mapAssetUrl(base, releaseKey, "geo.pmtiles"),
    },
    styleUrl: "/api/styles/plain.json",
    glyphsUrl: mapAssetUrl(base, releaseKey, "fonts/{fontstack}/{range}.pbf"),
    attribution: "© OpenStreetMap contributors · Natural Earth · Nomadeezee",
  };
}

function toManifest(release: MapReleaseRecord, generation: number): MapManifest {
  const base = serverEnv("NEXT_PUBLIC_MAP_TILES_BASE_URL") ?? "https://tiles.map.nomadeezee.com";
  return {
    channel: "production",
    generation,
    releaseId: release.id,
    releaseKey: release.release_key,
    createdAt: release.created_at,
    sources: {
      world: mapAssetUrl(base, release.release_key, "world.pmtiles"),
      vietnam: mapAssetUrl(base, release.release_key, "vietnam.pmtiles"),
      geo: mapAssetUrl(base, release.release_key, "geo.pmtiles"),
    },
    styleUrl: "/api/styles/plain.json",
    glyphsUrl: mapAssetUrl(base, release.release_key, "fonts/{fontstack}/{range}.pbf"),
    attribution: "© OpenStreetMap contributors · Natural Earth · Nomadeezee",
  };
}

export async function getActiveManifest(): Promise<MapManifest> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fallbackManifest();

  const { data: channel, error: channelError } = await supabase
    .from("map_channel")
    .select("active_release_id,generation")
    .eq("channel", "production")
    .maybeSingle();
  if (channelError || !channel?.active_release_id) return fallbackManifest();

  const { data: release, error: releaseError } = await supabase
    .from("map_releases")
    .select("id,release_key,generation,world_version,vietnam_version,geo_version,style_version,glyphs_version,status,created_at")
    .eq("id", channel.active_release_id)
    .eq("status", "active")
    .single();
  if (releaseError || !release) return fallbackManifest();
  return toManifest(release as MapReleaseRecord, Number(channel.generation));
}
