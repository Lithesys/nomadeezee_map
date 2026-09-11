# Publishing and rollback runbook

## Publish

1. An authenticated admin saves a draft revision.
2. `POST /api/admin/features/{featureId}/publish` calls `request_map_publish` with the exact `revisionId`.
3. The RPC locks the production channel, refuses a second active job, copies the active release feature set, replaces the selected feature revision, and creates a queued job.
4. Dispatch `.github/workflows/publish-map.yml` with the returned `job_id`, `release_id`, `release_key`, and `expected_generation`.
5. The worker downloads the pinned source inputs, exports the frozen PostGIS snapshot, builds PMTiles, and uploads only to the new release prefix.
6. The worker verifies HTTP `206` range reads, `Accept-Ranges: bytes`, non-empty PMTiles headers, and MapLibre style JSON. A failed check calls `mark_map_publish_failed`; the active release does not change.
7. `activate_map_release` marks the release active and increments the channel generation in one transaction. The old release is retained as `superseded` for rollback.

## Rollback

1. Read `/api/map/version` and list previously active releases through the admin database view/API.
2. Confirm the target release still has all three PMTiles objects, fonts, and its style asset in R2.
3. Call `POST /api/admin/map/rollback` with the target `releaseId` and the current `expectedGeneration`.
4. The RPC locks the channel, rejects a stale generation, changes the pointer, records an activation event with `action=rollback`, and increments generation.

Rollback does not rebuild data and does not alter drafts. A worker that was building against the old generation cannot activate after the rollback because its generation check fails. Keep old R2 prefixes until retention and backup policy are explicitly established.

## Failure handling

`queued`, `building`, `uploading`, and `verifying` are still private. A failed or superseded release is never returned by the public manifest. Retry by dispatching a new workflow for the same frozen release only after checking the original failure; use a new release if the source or revision changed.

The workflow uses GitHub Secrets for Supabase, R2, source URLs, and the actor UUID. Rotate those credentials through the provider consoles; never put values in repository files or logs.

## First production checklist

- Pin and record the exact Planetiler container digest and Natural Earth/OSM input checksums.
- Benchmark the GitHub runner with the full Vietnam extract; record peak memory, disk, duration, and tile size.
- Configure R2 CORS for the production domains and verify a real `206` response through the custom domain.
- Upload the PBF glyph ranges required by `Be Vietnam Pro Regular`; a release without its glyphs must remain private.
- Confirm OSM/Natural Earth attribution in the consuming Nomadeezee map.
- Exercise concurrent publish, failed upload, stale activation, and rollback in a staging Supabase project before enabling the public channel.
