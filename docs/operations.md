# Operations notes

Use `npm run typecheck` for the static TypeScript check. Tile builds are intentionally not part of a Vercel build: run them in GitHub Actions with the workflow inputs and secrets documented in [publishing.md](publishing.md).

The first release should be treated as a benchmark checkpoint. Confirm that the source-layer names emitted by the chosen Planetiler profile match `plainMapStyle()` (`landcover`, `water`, `transportation`, and `boundary`). If the profile uses different names, change the style and the release validation together, then publish a new immutable release.
