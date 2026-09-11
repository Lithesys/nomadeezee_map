# Nomadeezee Map Platform

This repository is the standalone map service for Nomadeezee. It owns the editable geographic database, immutable PMTiles releases, the plain MapLibre style, and the production release pointer consumed by `nomadeezee.com`.

## Local setup

1. Install Node 22 and run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL/key. The service role key is server-only.
3. Apply `supabase/migrations/20260911000000_initial_map_platform.sql` with the Supabase CLI or dashboard migration workflow.
4. Start the app with `npm run dev`.

The public contract is available at `/api/styles/plain.json`, `/api/map/manifest`, and `/api/map/version`. Without a configured database, the APIs return the safe bootstrap manifest so the app can still be previewed.

## Release model

A publish request freezes a complete release snapshot in Postgres. GitHub Actions builds `world.pmtiles`, `vietnam.pmtiles`, and `geo.pmtiles` into a release-specific R2 prefix. The workflow verifies PMTiles HTTP range reads and style metadata before calling the activation RPC. The only mutable value is `map_channel.active_release_id`.

See [docs/architecture.md](docs/architecture.md) for the component boundaries and [docs/publishing.md](docs/publishing.md) for the operator runbook.

## Source and licensing

The Vietnam basemap is intended to be built from OpenStreetMap data using Planetiler/OpenMapTiles conventions. Keep the OSM attribution visible in the consuming map and publish the applicable ODbL notices. The low-zoom world layer uses Natural Earth data; preserve its source notice in release metadata.

## Current checkpoint

This checkpoint implements the authenticated interactive editor foundation on top of the release/database/API model. `/admin` now provides a MapLibre canvas, searchable feature list, GeoJSON geometry overlay, draggable vertices, draggable label points, draft metadata editing, local geometry validation, and draft-save actions. The editor starts with a small Da Nang starter shape when creating the first feature so the interaction can be tested before a basemap extract is published.

The next production increment is to import the first Vietnam extract, publish the initial PMTiles assets, and add revision-history and publish controls to the inspector. See [docs/admin-editor.md](docs/admin-editor.md) for the editor workflow and API contract.
