# Admin editor

The admin workspace lives at `/admin` and requires a Supabase account whose `app_metadata` contains an `admin` role. Authorization is checked on the server with `auth.getUser()` and is repeated by every admin API route.

## Editor workflow

1. Open `/admin` and search the feature list by name, translated name, slug, or feature type.
2. Select a feature. The editor loads its geometry and label point as GeoJSON through the authenticated detail endpoint.
3. Edit the inspector fields: feature type, names, slug (new features only), zoom range, label minimum zoom, and label priority.
4. Drag white vertices to reshape the MultiPolygon. The first and closing coordinate of a ring stay synchronized. Use **Add vertex** or select a vertex and use **Remove vertex** for simple ring edits.
5. Drag the dark label marker to position the geographic name. **Place label point** puts a label anchor at the current map center.
6. Click **Save draft**. The browser performs a lightweight coordinate check first; PostGIS `ST_IsValid` remains the final authority in the save function.

The editor never autosaves mouse movement. All changes remain local until the admin explicitly saves a draft.

## API contract

- `GET /api/admin/features` returns searchable list metadata.
- `POST /api/admin/features` creates a feature and its initial revision through `create_map_feature_draft`.
- `GET /api/admin/features/:id` returns server-serialized GeoJSON through `get_map_feature_editor`.
- `PATCH /api/admin/features/:id` creates the next draft revision through `save_map_feature_draft`.
- `POST /api/admin/validate-geometry` checks finite EPSG:4326 coordinates before a save.

The editor uses database functions for geometry conversion so PostGIS columns are never written directly from the browser and no service-role key is exposed to client code.

## Basemap readiness

The public map contract remains `/api/styles/plain.json` and uses PMTiles releases. The admin canvas currently uses a small built-in Vietnam context plus an OpenStreetMap raster fallback so the editing surface remains usable before the first R2 release. It displays a non-blocking notice when the raster fallback cannot be reached. The built-in outline is an editing context only and must not be published as authoritative geography. Publishing a Vietnam extract is a separate pipeline milestone.
