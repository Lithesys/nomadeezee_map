import { getActiveManifest } from "@/lib/map/manifest";

export const dynamic = "force-dynamic";

export async function GET() {
  const manifest = await getActiveManifest();
  return Response.json({
    channel: manifest.channel,
    generation: manifest.generation,
    releaseId: manifest.releaseId,
    releaseKey: manifest.releaseKey,
  }, { headers: { "Cache-Control": "no-store" } });
}
