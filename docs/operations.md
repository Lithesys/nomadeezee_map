# Operations notes

Use `npm run typecheck` for the static TypeScript check. Tile builds are intentionally not part of a Vercel build: run them in GitHub Actions with the workflow inputs and secrets documented in [publishing.md](publishing.md).

The first release should be treated as a benchmark checkpoint. Confirm that the source-layer names emitted by the chosen Planetiler profile match `plainMapStyle()` (`landcover`, `water`, `transportation`, and `boundary`). If the profile uses different names, change the style and the release validation together, then publish a new immutable release.

The Tippecanoe inputs are intentionally layered. `data/geo.geojson` must contain `boundaries` and `labels` features, while `data/world.geojson` must contain `land`, `water`, and `boundary` features. The builder writes one PMTiles archive per dataset with named source layers; a single catch-all layer will fail the build instead of producing a blank map.

Before activating the first release, verify the release prefix contains `world.pmtiles`, `vietnam.pmtiles`, `geo.pmtiles`, `style.json`, and the complete `fonts/` tree. Use the range-read check in `scripts/verify-release.ts` through `tiles.map.nomadeezee.com`, not only a local filesystem check.
