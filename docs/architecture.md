# Map platform architecture

## Runtime boundaries

`map.nomadeezee.com` runs the Next.js API and admin shell on Vercel. MapLibre in the consuming application loads the stable style URL. The style resolves to PMTiles over `tiles.map.nomadeezee.com`, backed by Cloudflare R2. Vercel does not generate basemap tiles per request.

The public map has three vector sources:

- `world`: Natural Earth overview data, used at low zoom.
- `vietnam`: a Vietnam OSM extract built with Planetiler/OpenMapTiles conventions.
- `nomadeezee_geo`: custom boundaries and label points exported from a frozen PostGIS release.

`plainMapStyle()` is the single source of truth for the intentionally quiet visual language: land, water, roads, administrative boundaries, and geographic names. Nomadeezee places, boards, routes, and markers remain application overlays.

## Data ownership

`map_features` is the current editorial record. Every edit is copied into `map_feature_revisions`; a release references exact revision IDs in `map_release_features`. A release therefore cannot change when an admin later edits a feature.

PostGIS stores geometries in EPSG:4326. The database rejects invalid polygons. The editor should validate locally before saving and show `ST_MakeValid` output as a proposed repair rather than silently changing user geometry.

## Production consistency

`map_channel` contains one `production` row and one active release pointer. A release becomes public only after all artifacts are uploaded and verified. Activation locks the channel row and checks the generation observed when the release was requested. If another release or a rollback won first, the stale build is rejected.

Versioned R2 paths are immutable: `releases/{releaseKey}/world.pmtiles`, `vietnam.pmtiles`, `geo.pmtiles`, and fonts. The public manifest is generated from the active database pointer; there is no mutable manifest object on R2 that can disagree with Postgres.

## Security

Admin routes call `auth.getUser()` server-side and authorize only `app_metadata` roles. Client-editable `user_metadata` is never used for authorization. RLS exposes published features and the production channel publicly; draft, revision, job, and activation data require the admin policy. The service role key is used only by the GitHub worker and server-side scripts.
