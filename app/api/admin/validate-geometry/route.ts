import { z } from "zod";

import { requireAdmin } from "@/lib/supabase/server";

const coordinate = z.number().finite();
const geometrySchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.array(z.unknown()),
});

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });
  const parsed = z.object({ geometry: geometrySchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ valid: false, error: parsed.error.flatten() }, { status: 400 });

  const coordinates = parsed.data.geometry.coordinates;
  const numbers = JSON.stringify(coordinates).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length < 6 || numbers.some((value) => !coordinate.safeParse(value).success)) {
    return Response.json({ valid: false, error: "Geometry must contain finite coordinates" }, { status: 400 });
  }
  if (numbers.some((value, index) => index % 2 === 0 && (value < -180 || value > 180)) || numbers.some((value, index) => index % 2 === 1 && (value < -90 || value > 90))) {
    return Response.json({ valid: false, error: "Coordinates must be longitude/latitude in EPSG:4326" }, { status: 400 });
  }
  return Response.json({ valid: true, note: "PostGIS ST_IsValid remains the final save/publish check" });
}
