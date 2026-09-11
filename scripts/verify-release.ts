import { readFile } from "node:fs/promises";
import path from "node:path";

async function main() {
const base = (process.env.TILES_BASE_URL ?? "").replace(/\/$/, "");
const releaseKey = process.env.RELEASE_KEY?.trim();
if (!base || !releaseKey) throw new Error("TILES_BASE_URL and RELEASE_KEY are required");

for (const asset of ["world.pmtiles", "vietnam.pmtiles", "geo.pmtiles"]) {
  const response = await fetch(`${base}/releases/${encodeURIComponent(releaseKey)}/${asset}`, {
    headers: { Range: "bytes=0-63" },
  });
  if (response.status !== 206) throw new Error(`${asset} did not return HTTP 206 for a range request (got ${response.status})`);
  if (!(response.headers.get("accept-ranges") ?? "").toLowerCase().includes("bytes")) throw new Error(`${asset} is missing Accept-Ranges: bytes`);
  if ((await response.arrayBuffer()).byteLength === 0) throw new Error(`${asset} returned an empty range`);
}

const stylePath = path.resolve("data/style.json");
try {
  const style = JSON.parse(await readFile(stylePath, "utf8")) as { version?: number; sources?: Record<string, unknown> };
  if (style.version !== 8 || !style.sources?.nomadeezee_geo) throw new Error("style.json is not a MapLibre v8 style with nomadeezee_geo");
} catch (error) {
  if (error instanceof SyntaxError) throw new Error("style.json is not valid JSON");
  throw error;
}
console.log(`Verified release ${releaseKey}: PMTiles range requests and style metadata passed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
