import { getActiveManifest } from "@/lib/map/manifest";
import { plainMapStyle } from "@/lib/map/style";

export const dynamic = "force-dynamic";

export async function GET() {
  const manifest = await getActiveManifest();
  return Response.json(plainMapStyle(manifest), {
    headers: { "Cache-Control": "no-store" },
  });
}
