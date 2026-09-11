import { getActiveManifest } from "@/lib/map/manifest";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getActiveManifest(), {
    headers: { "Cache-Control": "no-store" },
  });
}
