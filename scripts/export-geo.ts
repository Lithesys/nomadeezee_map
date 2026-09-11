import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

type RevisionRow = {
  feature_id: string;
  revision_id: string;
  revision: Record<string, unknown> | null;
  feature: { feature_type: string } | null;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const releaseId = required("RELEASE_ID");

const { data, error } = await supabase
  .from("map_release_features")
  .select("feature_id,revision_id,revision:map_feature_revisions(*),feature:map_features(feature_type)")
  .eq("release_id", releaseId);
if (error) throw new Error(`Could not export release features: ${error.message}`);

const rows = (data ?? []) as unknown as RevisionRow[];
const features = rows.flatMap((row) => {
  const revision = row.revision;
  if (!revision) return [];
  const geometry = revision.geometry as Record<string, unknown> | null;
  const labelPoint = revision.label_point as Record<string, unknown> | null;
  const properties = {
    id: row.feature_id,
    feature_type: row.feature?.feature_type,
    name: revision.name,
    name_vi: revision.name_vi,
    name_en: revision.name_en,
    min_zoom: revision.min_zoom,
    max_zoom: revision.max_zoom,
    label_min_zoom: revision.label_min_zoom,
    label_priority: revision.label_priority,
  };
  const output: Array<Record<string, unknown>> = [];
  if (geometry) output.push({ type: "Feature", id: row.feature_id, geometry, properties: { ...properties, layer: "boundaries" } });
  if (labelPoint) output.push({ type: "Feature", id: `${row.feature_id}-label`, geometry: labelPoint, properties: { ...properties, layer: "labels" } });
  return output;
});

const outputPath = path.resolve(process.env.GEOJSON_OUTPUT ?? "data/geo.geojson");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ type: "FeatureCollection", features }, null, 2)}\n`, "utf8");
console.log(`Exported ${features.length} GeoJSON features to ${outputPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
