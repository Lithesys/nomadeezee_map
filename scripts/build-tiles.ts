import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
async function main() {
const root = path.resolve(process.env.GITHUB_WORKSPACE ?? process.cwd());
const dataDir = path.join(root, "data");
const releaseDir = path.join(dataDir, "release");
const releaseKey = process.env.RELEASE_KEY?.trim();
if (!releaseKey) throw new Error("RELEASE_KEY is required");

async function exists(file: string) {
  try { await access(file); return true; } catch { return false; }
}
async function run(command: string, args: string[]) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = await exec(command, args, { cwd: root, maxBuffer: 10 * 1024 * 1024 });
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
}

await mkdir(releaseDir, { recursive: true });
const geo = path.join(dataDir, "geo.geojson");
const world = path.join(dataDir, "world.geojson");
const vietnamPbf = path.join(dataDir, "vietnam.osm.pbf");
if (!(await exists(geo))) throw new Error(`Missing ${geo}; run export:geo first`);
if (!(await exists(world))) throw new Error(`Missing ${world}; provide the versioned Natural Earth input`);
if (!(await exists(vietnamPbf))) throw new Error(`Missing ${vietnamPbf}; provide the Vietnam OSM extract`);

type GeoJsonFeature = { type: "Feature"; properties?: Record<string, unknown> | null; geometry?: unknown };
type GeoJsonCollection = { type: "FeatureCollection"; features?: GeoJsonFeature[] };

async function prepareNamedLayers(input: string, outputDir: string, expectedLayers: string[]) {
  const parsed = JSON.parse(await readFile(input, "utf8")) as GeoJsonCollection;
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error(`${input} must be a GeoJSON FeatureCollection`);
  }

  const grouped = new Map<string, GeoJsonFeature[]>();
  for (const feature of parsed.features) {
    const rawLayer = feature.properties?.layer ?? feature.properties?.source_layer ?? feature.properties?.["source-layer"];
    const layer = typeof rawLayer === "string" ? rawLayer.trim() : "";
    if (!layer) throw new Error(`${input} has a feature without properties.layer/source_layer`);
    const features = grouped.get(layer) ?? [];
    features.push(feature);
    grouped.set(layer, features);
  }

  const missing = expectedLayers.filter((layer) => !grouped.has(layer));
  if (missing.length) throw new Error(`${input} is missing required layers: ${missing.join(", ")}`);

  const layers: Array<{ name: string; localPath: string; containerPath: string }> = [];
  for (const [name, features] of grouped) {
    const filename = `${path.basename(input, path.extname(input))}-${name}.geojson`;
    const localPath = path.join(outputDir, filename);
    await writeFile(localPath, `${JSON.stringify({ type: "FeatureCollection", features })}\n`, "utf8");
    layers.push({ name, localPath, containerPath: `/data/.tile-inputs/${filename}` });
  }
  return layers;
}

// Keep generated GeoJSON intermediates outside the upload prefix. Only the
// immutable PMTiles and staged fonts should be copied to R2.
const preparedInputDir = path.join(dataDir, ".tile-inputs");
await mkdir(preparedInputDir, { recursive: true });
const geoLayers = await prepareNamedLayers(geo, preparedInputDir, ["boundaries", "labels"]);
const worldLayers = await prepareNamedLayers(world, preparedInputDir, ["land", "water", "boundary"]);

const tippecanoeArgs = (output: string, layers: Array<{ name: string; localPath: string; containerPath: string }>, maximumZoom: number, inDocker: boolean) => [
  `--output=${output}`, "--force", "--no-tile-compression", `--maximum-zoom=${maximumZoom}`, "--minimum-zoom=0",
  ...layers.flatMap((layer) => [`--named-layer=${layer.name}:${inDocker ? layer.containerPath : layer.localPath}`]),
];
if (process.env.TIPPECANOE_IMAGE) {
  await run("docker", ["run", "--rm", "-v", `${dataDir}:/data`, process.env.TIPPECANOE_IMAGE, ...tippecanoeArgs("/data/release/geo.pmtiles", geoLayers, 16, true)]);
  await run("docker", ["run", "--rm", "-v", `${dataDir}:/data`, process.env.TIPPECANOE_IMAGE, ...tippecanoeArgs("/data/release/world.pmtiles", worldLayers, 6, true)]);
} else {
  const tippecanoe = process.env.TIPPECANOE_BIN ?? "tippecanoe";
  await run(tippecanoe, tippecanoeArgs(path.join(releaseDir, "geo.pmtiles"), geoLayers, 16, false));
  await run(tippecanoe, tippecanoeArgs(path.join(releaseDir, "world.pmtiles"), worldLayers, 6, false));
}

const planetilerImage = process.env.PLANETILER_IMAGE ?? "ghcr.io/onthegomap/planetiler:0.10.2";
await run("docker", ["run", "--rm", "-v", `${dataDir}:/data`, planetilerImage, "--osm-path=/data/vietnam.osm.pbf", "--output=/data/release/vietnam.pmtiles", "--area=11.8,102.1,23.6,109.5"]);
for (const asset of ["geo.pmtiles", "world.pmtiles", "vietnam.pmtiles"]) {
  const assetPath = path.join(releaseDir, asset);
  if (!(await exists(assetPath))) throw new Error(`Tile builder did not create ${assetPath}`);
}
console.log(`Built immutable tile set ${releaseKey} in ${releaseDir}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
