import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { publicTileBaseUrl } from "@/lib/env";
import { plainMapStyle } from "@/lib/map/style";
import type { MapManifest } from "@/lib/map/types";

async function main() {
const releaseKey = process.env.RELEASE_KEY?.trim();
if (!releaseKey) throw new Error("RELEASE_KEY is required");
const base = (process.env.TILES_BASE_URL ?? publicTileBaseUrl()).replace(/\/$/, "");
const manifest: MapManifest = {
  channel: "production",
  generation: Number(process.env.EXPECTED_GENERATION ?? 0) + 1,
  releaseId: process.env.RELEASE_ID ?? releaseKey,
  releaseKey,
  createdAt: new Date().toISOString(),
  sources: {
    world: `${base}/releases/${encodeURIComponent(releaseKey)}/world.pmtiles`,
    vietnam: `${base}/releases/${encodeURIComponent(releaseKey)}/vietnam.pmtiles`,
    geo: `${base}/releases/${encodeURIComponent(releaseKey)}/geo.pmtiles`,
  },
  styleUrl: "/api/styles/plain.json",
  glyphsUrl: `${base}/releases/${encodeURIComponent(releaseKey)}/fonts/{fontstack}/{range}.pbf`,
  attribution: "© OpenStreetMap contributors · Natural Earth · Nomadeezee",
};
const output = path.resolve(process.env.STYLE_OUTPUT ?? "data/style.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(plainMapStyle(manifest), null, 2)}\n`, "utf8");
console.log(`Wrote release style to ${output}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
