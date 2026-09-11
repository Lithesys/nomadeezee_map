import { access, mkdir } from "node:fs/promises";
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

const tippecanoeArgs = (output: string, layer: string, input: string, maximumZoom: number) => [
  `--output=${output}`, "--force", "--no-tile-compression", `--maximum-zoom=${maximumZoom}`, "--minimum-zoom=0", `--layer=${layer}`, input,
];
if (process.env.TIPPECANOE_IMAGE) {
  await run("docker", ["run", "--rm", "-v", `${dataDir}:/data`, process.env.TIPPECANOE_IMAGE, ...tippecanoeArgs("/data/release/geo.pmtiles", "geo", "/data/geo.geojson", 16)]);
  await run("docker", ["run", "--rm", "-v", `${dataDir}:/data`, process.env.TIPPECANOE_IMAGE, ...tippecanoeArgs("/data/release/world.pmtiles", "world", "/data/world.geojson", 6)]);
} else {
  const tippecanoe = process.env.TIPPECANOE_BIN ?? "tippecanoe";
  await run(tippecanoe, tippecanoeArgs(path.join(releaseDir, "geo.pmtiles"), "geo", geo, 16));
  await run(tippecanoe, tippecanoeArgs(path.join(releaseDir, "world.pmtiles"), "world", world, 6));
}

const planetilerImage = process.env.PLANETILER_IMAGE ?? "ghcr.io/onthegomap/planetiler:0.10.2";
await run("docker", ["run", "--rm", "-v", `${dataDir}:/data`, planetilerImage, "--osm-path=/data/vietnam.osm.pbf", "--output=/data/release/vietnam.pmtiles", "--area=11.8,102.1,23.6,109.5"]);
console.log(`Built immutable tile set ${releaseKey} in ${releaseDir}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
