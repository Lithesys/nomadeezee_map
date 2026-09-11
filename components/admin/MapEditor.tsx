"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type FilterSpecification, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";

type FeatureType = "country" | "province" | "district" | "city" | "area" | "island" | "neighbourhood";
type Coordinate = [number, number];
type PolygonGeometry = { type: "Polygon"; coordinates: Coordinate[][] };
type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Coordinate[][][] };
type FeatureGeometry = PolygonGeometry | MultiPolygonGeometry;
type PointGeometry = { type: "Point"; coordinates: Coordinate };

type MapFeature = {
  id: string;
  feature_type: FeatureType;
  name: string;
  name_vi: string | null;
  name_en: string | null;
  slug: string;
  geometry: FeatureGeometry | null;
  label_point: PointGeometry | null;
  min_zoom: number;
  max_zoom: number;
  label_min_zoom: number;
  label_priority: number;
  status: "draft" | "published" | "archived";
  version: number;
  latest_revision_id?: string | null;
  updated_at?: string;
};

type FeatureSummary = Pick<
  MapFeature,
  | "id"
  | "feature_type"
  | "name"
  | "name_vi"
  | "name_en"
  | "slug"
  | "min_zoom"
  | "max_zoom"
  | "label_min_zoom"
  | "label_priority"
  | "status"
  | "version"
  | "updated_at"
>;

type DragState = { kind: "vertex" | "label"; key?: string };
type Revision = Pick<MapFeature, "id" | "name" | "name_vi" | "name_en" | "min_zoom" | "max_zoom" | "label_min_zoom" | "label_priority" | "version" | "status"> & {
  feature_id: string;
  created_by: string;
  created_at: string;
};
type ReleaseSummary = {
  id: string;
  release_key: string;
  generation: number;
  status: "building" | "ready" | "active" | "failed" | "superseded";
  created_at: string;
  activated_at: string | null;
  failure_reason: string | null;
};
type PublishJob = {
  id: string;
  release_id: string;
  status: "queued" | "building" | "uploading" | "verifying" | "succeeded" | "failed" | "superseded";
  error_message: string | null;
  created_at: string;
};

const featureTypes: FeatureType[] = ["country", "province", "district", "city", "area", "island", "neighbourhood"];

const editorContextData: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { kind: "country", name: "Vietnam" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [102.14, 22.4], [103.3, 22.8], [104.5, 22.5], [105.4, 23.3], [106.7, 22.9],
          [107.5, 21], [108.4, 20.3], [109.5, 18.5], [109.4, 17], [108.5, 16], [109.3, 15],
          [109.5, 13.5], [109.2, 12], [108.7, 10.5], [108, 9.3], [106.5, 8.7], [105.5, 9],
          [104.8, 10], [104.2, 10.8], [103.5, 11], [103, 12.5], [102.5, 14], [102, 16],
          [102.2, 17.5], [101.8, 19], [102.3, 20.5], [102.14, 22.4],
        ]],
      },
    },
    { type: "Feature", properties: { kind: "city", name: "Hanoi" }, geometry: { type: "Point", coordinates: [105.85, 21.03] } },
    { type: "Feature", properties: { kind: "city", name: "Da Nang" }, geometry: { type: "Point", coordinates: [108.2, 16.07] } },
    { type: "Feature", properties: { kind: "city", name: "Ho Chi Minh City" }, geometry: { type: "Point", coordinates: [106.7, 10.78] } },
  ],
};

// The editor needs a useful geographic context before the first PMTiles release
// is published. This lightweight fallback is restricted to the admin canvas;
// the public map contract continues to use the versioned PMTiles style.
const countryFilter = ["==", ["get", "kind"], "country"] as FilterSpecification;
const cityFilter = ["==", ["get", "kind"], "city"] as FilterSpecification;
const editorRasterUrl = process.env.NEXT_PUBLIC_MAP_EDITOR_RASTER_URL?.trim();

const editorBaseStyle: StyleSpecification = {
  version: 8 as const,
  name: "Nomadeezee editor context",
  sources: {
    ...(editorRasterUrl ? { osm: {
      type: "raster" as const,
      tiles: [`${editorRasterUrl ?? "https://tile.openstreetmap.org"}/{z}/{x}/{y}.png`],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    } } : {}),
    context: { type: "geojson" as const, data: editorContextData },
  },
  layers: [
    ...(editorRasterUrl ? [{ id: "osm-context", type: "raster" as const, source: "osm" }] : []),
    { id: "editor-context-fill", type: "fill" as const, source: "context", filter: countryFilter, paint: { "fill-color": "#e7eee7", "fill-opacity": 0.48 } },
    { id: "editor-context-outline", type: "line" as const, source: "context", filter: countryFilter, paint: { "line-color": "#718b80", "line-width": 1.5 } },
    { id: "editor-context-cities", type: "circle" as const, source: "context", filter: cityFilter, paint: { "circle-radius": 4, "circle-color": "#bd553b", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } },
  ],
};

const starterGeometry: MultiPolygonGeometry = {
  type: "MultiPolygon",
  coordinates: [
    [[
      [108.08, 16.16],
      [108.28, 16.16],
      [108.28, 16.04],
      [108.08, 16.04],
      [108.08, 16.16],
    ]],
  ],
};

function newFeature(): MapFeature {
  return {
    id: "",
    feature_type: "city",
    name: "",
    name_vi: "",
    name_en: "",
    slug: "new-feature",
    geometry: starterGeometry,
    label_point: { type: "Point", coordinates: [108.18, 16.1] },
    min_zoom: 0,
    max_zoom: 14,
    label_min_zoom: 5,
    label_priority: 0,
    status: "draft",
    version: 0,
  };
}

function asMultiPolygon(geometry: FeatureGeometry | null): MultiPolygonGeometry | null {
  if (!geometry) return null;
  if (geometry.type === "MultiPolygon") return geometry;
  return { type: "MultiPolygon", coordinates: [geometry.coordinates] };
}

function cloneFeature(feature: MapFeature): MapFeature {
  return JSON.parse(JSON.stringify(feature)) as MapFeature;
}

function editorData(feature: MapFeature | null) {
  const features: GeoJSON.Feature[] = [];
  const vertices: GeoJSON.Feature[] = [];
  const labels: GeoJSON.Feature[] = [];
  const geometry = asMultiPolygon(feature?.geometry ?? null);

  if (geometry) {
    features.push({ type: "Feature", geometry, properties: { kind: "geometry" } });
    geometry.coordinates.forEach((polygon, polygonIndex) => {
      polygon.forEach((ring, ringIndex) => {
        ring.forEach((coordinate, pointIndex) => {
          vertices.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: coordinate },
            properties: { key: `${polygonIndex}:${ringIndex}:${pointIndex}` },
          });
        });
      });
    });
  }

  if (feature?.label_point) {
    labels.push({
      type: "Feature",
      geometry: feature.label_point,
      properties: { kind: "label" },
    });
  }

  return {
    geometry: { type: "FeatureCollection", features },
    vertices: { type: "FeatureCollection", features: vertices },
    labels: { type: "FeatureCollection", features: labels },
  } satisfies Record<string, GeoJSON.FeatureCollection>;
}

function withVertex(feature: MapFeature, key: string, coordinate: Coordinate): MapFeature {
  const geometry = asMultiPolygon(feature.geometry);
  if (!geometry) return feature;
  const [polygonIndex, ringIndex, pointIndex] = key.split(":").map(Number);
  const coordinates = geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map((point) => [...point] as Coordinate)));
  const ring = coordinates[polygonIndex]?.[ringIndex];
  if (!ring?.[pointIndex]) return feature;

  ring[pointIndex] = coordinate;
  if (pointIndex === 0) ring[ring.length - 1] = coordinate;
  if (pointIndex === ring.length - 1) ring[0] = coordinate;

  return { ...feature, geometry: { type: "MultiPolygon", coordinates } };
}

function withLabelPoint(feature: MapFeature, coordinate: Coordinate): MapFeature {
  return { ...feature, label_point: { type: "Point", coordinates: coordinate } };
}

function addVertex(feature: MapFeature, selectedKey: string | null): { feature: MapFeature; key: string | null } {
  const geometry = asMultiPolygon(feature.geometry);
  if (!geometry || geometry.coordinates.length === 0 || geometry.coordinates[0].length === 0) return { feature, key: selectedKey };
  const coordinates = geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map((point) => [...point] as Coordinate)));
  const ring = coordinates[0][0];
  if (ring.length < 4) return { feature, key: selectedKey };
  const first = ring[0];
  const second = ring[1];
  const midpoint: Coordinate = [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2];
  ring.splice(1, 0, midpoint);
  return { feature: { ...feature, geometry: { type: "MultiPolygon", coordinates } }, key: "0:0:1" };
}

function removeVertex(feature: MapFeature, key: string | null): MapFeature {
  const geometry = asMultiPolygon(feature.geometry);
  if (!geometry || !key) return feature;
  const [polygonIndex, ringIndex, pointIndex] = key.split(":").map(Number);
  const coordinates = geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map((point) => [...point] as Coordinate)));
  const ring = coordinates[polygonIndex]?.[ringIndex];
  if (!ring || ring.length <= 4 || !ring[pointIndex]) return feature;
  const removeIndex = pointIndex === ring.length - 1 ? 0 : pointIndex;
  ring.splice(removeIndex, 1);
  ring[ring.length - 1] = [...ring[0]] as Coordinate;
  return { ...feature, geometry: { type: "MultiPolygon", coordinates } };
}

function featureBounds(feature: MapFeature): [[number, number], [number, number]] | null {
  const coordinates: Coordinate[] = [];
  const geometry = asMultiPolygon(feature.geometry);
  geometry?.coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach((coordinate) => coordinates.push(coordinate))));
  if (feature.label_point) coordinates.push(feature.label_point.coordinates);
  if (!coordinates.length) return null;
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]];
}

export default function MapEditor() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const draftRef = useRef<MapFeature | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const [features, setFeatures] = useState<FeatureSummary[]>([]);
  const [draftFeature, setDraftFeature] = useState<MapFeature | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loadingFeatures, setLoadingFeatures] = useState(true);
  const [loadingFeature, setLoadingFeature] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [publishJobs, setPublishJobs] = useState<PublishJob[]>([]);
  const [activeReleaseId, setActiveReleaseId] = useState<string | null>(null);
  const [releaseGeneration, setReleaseGeneration] = useState(0);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [dispatchingJob, setDispatchingJob] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(editorRasterUrl ? null : "Using the lightweight Vietnam editing context until the versioned PMTiles basemap is published.");
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    draftRef.current = draftFeature;
  }, [draftFeature]);

  const loadFeatures = useCallback(async () => {
    setLoadingFeatures(true);
    try {
      const response = await fetch("/api/admin/features", { cache: "no-store" });
      const body = (await response.json()) as { features?: FeatureSummary[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load features");
      setFeatures(body.features ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load features");
    } finally {
      setLoadingFeatures(false);
    }
  }, []);

  const loadReleases = useCallback(async () => {
    setLoadingReleases(true);
    try {
      const [releaseResponse, jobsResponse] = await Promise.all([
        fetch("/api/admin/releases", { cache: "no-store" }),
        fetch("/api/admin/publish-jobs", { cache: "no-store" }),
      ]);
      const releaseBody = (await releaseResponse.json()) as { releases?: ReleaseSummary[]; activeReleaseId?: string | null; generation?: number; error?: string };
      const jobsBody = (await jobsResponse.json()) as { jobs?: PublishJob[]; error?: string };
      if (!releaseResponse.ok) throw new Error(releaseBody.error ?? "Could not load releases");
      if (!jobsResponse.ok) throw new Error(jobsBody.error ?? "Could not load publish jobs");
      setReleases(releaseBody.releases ?? []);
      setActiveReleaseId(releaseBody.activeReleaseId ?? null);
      setReleaseGeneration(Number(releaseBody.generation ?? 0));
      setPublishJobs(jobsBody.jobs ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load releases");
    } finally {
      setLoadingReleases(false);
    }
  }, []);

  const loadRevisions = useCallback(async (featureId: string) => {
    setLoadingRevisions(true);
    try {
      const response = await fetch(`/api/admin/features/${featureId}/revisions`, { cache: "no-store" });
      const body = (await response.json()) as { revisions?: Revision[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load revisions");
      setRevisions(body.revisions ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load revisions");
      setRevisions([]);
    } finally {
      setLoadingRevisions(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadFeatures(), 0);
    return () => window.clearTimeout(timer);
  }, [loadFeatures]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReleases(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReleases]);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const protocol = new Protocol({ metadata: false });
    try {
      maplibregl.addProtocol("pmtiles", protocol.tile);
    } catch {
      // Fast refresh can re-run this module after the protocol is already registered.
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: editorBaseStyle,
      center: [108.2, 16.1],
      zoom: 5,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;

    const onMapError = (event: maplibregl.MapEventType["error"]) => {
      const error = event.error?.message ?? "Map data could not be loaded";
      if (/404|range|fetch|tile/i.test(error)) setMapError("Using the temporary OpenStreetMap editor context until the versioned PMTiles basemap is published.");
    };
    map.on("error", onMapError);

    map.on("load", () => {
      map.addSource("editor-geometry", { type: "geojson", data: editorData(null).geometry });
      map.addLayer({
        id: "editor-fill",
        type: "fill",
        source: "editor-geometry",
        paint: { "fill-color": "#d96b4d", "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: "editor-outline",
        type: "line",
        source: "editor-geometry",
        paint: { "line-color": "#bd553b", "line-width": 2.5, "line-dasharray": [2, 1] },
      });
      map.addSource("editor-vertices", { type: "geojson", data: editorData(null).vertices });
      map.addLayer({
        id: "editor-vertices",
        type: "circle",
        source: "editor-vertices",
        paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#bd553b", "circle-stroke-width": 2 },
      });
      map.addSource("editor-label", { type: "geojson", data: editorData(null).labels });
      map.addLayer({
        id: "editor-label",
        type: "circle",
        source: "editor-label",
        paint: { "circle-radius": 7, "circle-color": "#24453e", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
      });
      mapReadyRef.current = true;
      setMapReady(true);
    });

    const finishDrag = () => {
      dragRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    };

    map.on("mousedown", "editor-vertices", (event) => {
      const key = event.features?.[0]?.properties?.key;
      if (!key) return;
      event.preventDefault();
      setSelectedVertex(String(key));
      dragRef.current = { kind: "vertex", key: String(key) };
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    });
    map.on("mousedown", "editor-label", (event) => {
      event.preventDefault();
      dragRef.current = { kind: "label" };
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    });
    map.on("mousemove", (event) => {
      const drag = dragRef.current;
      const current = draftRef.current;
      if (!drag || !current) return;
      const coordinate: Coordinate = [event.lngLat.lng, event.lngLat.lat];
      setDraftFeature((previous) => {
        if (!previous) return previous;
        const next = drag.kind === "vertex" && drag.key ? withVertex(previous, drag.key, coordinate) : withLabelPoint(previous, coordinate);
        draftRef.current = next;
        return next;
      });
      setDirty(true);
    });
    map.on("mouseup", finishDrag);
    map.on("mouseleave", finishDrag);

    return () => {
      map.off("error", onMapError);
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !mapReadyRef.current) return;
    const data = editorData(draftFeature);
    (map.getSource("editor-geometry") as GeoJSONSource | undefined)?.setData(data.geometry);
    (map.getSource("editor-vertices") as GeoJSONSource | undefined)?.setData(data.vertices);
    (map.getSource("editor-label") as GeoJSONSource | undefined)?.setData(data.labels);
  }, [draftFeature, mapReady]);

  const draftFeatureId = draftFeature?.id;
  useEffect(() => {
    const current = draftRef.current;
    if (!current || !selectedId || !mapReady) return;
    const bounds = featureBounds(current);
    if (!bounds || !mapRef.current) return;
    mapRef.current.fitBounds(bounds, { padding: 90, maxZoom: 12, duration: 450 });
  }, [selectedId, mapReady, draftFeatureId]);

  const filteredFeatures = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return features;
    return features.filter((feature) => [feature.name, feature.name_vi, feature.name_en, feature.slug, feature.feature_type].filter(Boolean).some((value) => value!.toLowerCase().includes(needle)));
  }, [features, query]);

  async function selectFeature(id: string) {
    setLoadingFeature(true);
    setMessage(null);
    setSelectedVertex(null);
    try {
      const response = await fetch(`/api/admin/features/${id}`, { cache: "no-store" });
      const body = (await response.json()) as { feature?: MapFeature; error?: string };
      if (!response.ok || !body.feature) throw new Error(body.error ?? "Could not load feature");
      const next = cloneFeature(body.feature);
      setSelectedId(id);
      setDraftFeature(next);
      draftRef.current = next;
      setDirty(false);
      await loadRevisions(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load feature");
    } finally {
      setLoadingFeature(false);
    }
  }

  function startNewFeature() {
    const next = newFeature();
    setSelectedId(null);
    setSelectedVertex(null);
    setDraftFeature(next);
    setRevisions([]);
    draftRef.current = next;
    setDirty(true);
    setMessage("Starter geometry is ready. Edit it on the map, then save the draft.");
  }

  function updateDraftField<K extends keyof MapFeature>(field: K, value: MapFeature[K]) {
    setDraftFeature((previous) => {
      if (!previous) return previous;
      const next = { ...previous, [field]: value };
      draftRef.current = next;
      return next;
    });
    setDirty(true);
  }

  async function saveDraft() {
    if (!draftFeature) return;
    if (!draftFeature.name.trim() || !draftFeature.slug.trim()) {
      setMessage("Name and slug are required before saving.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (draftFeature.geometry) {
        const validation = await fetch("/api/admin/validate-geometry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geometry: draftFeature.geometry }),
        });
        const validationBody = (await validation.json()) as { valid?: boolean; error?: string };
        if (!validation.ok || !validationBody.valid) throw new Error(validationBody.error ?? "Geometry validation failed");
      }

      const isNew = !draftFeature.id;
      const response = await fetch(isNew ? "/api/admin/features" : `/api/admin/features/${draftFeature.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature_type: draftFeature.feature_type,
          name: draftFeature.name,
          name_vi: draftFeature.name_vi ?? "",
          name_en: draftFeature.name_en ?? "",
          slug: draftFeature.slug,
          geometry: draftFeature.geometry,
          label_point: draftFeature.label_point,
          min_zoom: draftFeature.min_zoom,
          max_zoom: draftFeature.max_zoom,
          label_min_zoom: draftFeature.label_min_zoom,
          label_priority: draftFeature.label_priority,
        }),
      });
      const body = (await response.json()) as { feature?: { featureId?: string }; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not save draft");
      const featureId = isNew ? body.feature?.featureId : draftFeature.id;
      if (!featureId) throw new Error("The server did not return a feature ID");
      await loadFeatures();
      await selectFeature(featureId);
      setDirty(false);
      setMessage("Draft saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save draft");
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    if (!draftFeature?.id) {
      setMessage("Save the feature as a draft before publishing.");
      return;
    }
    if (dirty) {
      setMessage("Save the current edits before publishing a revision.");
      return;
    }
    const revisionId = draftFeature.latest_revision_id ?? revisions[0]?.id;
    if (!revisionId) {
      setMessage("No revision is available to publish.");
      return;
    }

    setPublishing(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/features/${draftFeature.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId }),
      });
      const body = (await response.json()) as { dispatch?: { status?: string; reason?: string }; jobId?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? body.dispatch?.reason ?? "Could not queue publish");
      await loadReleases();
      const dispatchMessage = body.dispatch?.status === "dispatched"
        ? "Release queued and GitHub tile build dispatched."
        : "Release queued. Dispatch the GitHub workflow from the publish job panel.";
      setMessage(`${dispatchMessage}${body.jobId ? ` Job ${body.jobId.slice(0, 8)}…` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not publish draft");
    } finally {
      setPublishing(false);
    }
  }

  async function restoreRevision(revisionId: string) {
    if (!draftFeature?.id || dirty) {
      setMessage("Save or discard current edits before restoring a revision.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/features/${draftFeature.id}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not restore revision");
      await selectFeature(draftFeature.id);
      await loadFeatures();
      setMessage("Revision restored as a new draft. Review it before publishing.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not restore revision");
    } finally {
      setSaving(false);
    }
  }

  async function rollbackRelease(releaseId: string) {
    if (releaseId === activeReleaseId) return;
    setRollingBack(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/map/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId, expectedGeneration: releaseGeneration }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not roll back release");
      await loadReleases();
      setMessage("Production map rolled back. Existing drafts were not changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not roll back release");
    } finally {
      setRollingBack(false);
    }
  }

  async function dispatchJob(jobId: string) {
    setDispatchingJob(jobId);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/publish-jobs/${jobId}/dispatch`, { method: "POST" });
      const body = (await response.json()) as { dispatch?: { status?: string; reason?: string }; error?: string };
      if (!response.ok) throw new Error(body.error ?? body.dispatch?.reason ?? "Could not dispatch job");
      await loadReleases();
      setMessage(body.dispatch?.status === "dispatched" ? "GitHub tile build dispatched." : body.dispatch?.reason ?? "Job is queued for manual dispatch.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not dispatch job");
    } finally {
      setDispatchingJob(null);
    }
  }

  function handleAddVertex() {
    if (!draftFeature) return;
    const result = addVertex(draftFeature, selectedVertex);
    setDraftFeature(result.feature);
    draftRef.current = result.feature;
    setSelectedVertex(result.key);
    setDirty(true);
  }

  function handleRemoveVertex() {
    if (!draftFeature || !selectedVertex) return;
    const next = removeVertex(draftFeature, selectedVertex);
    setDraftFeature(next);
    draftRef.current = next;
    setSelectedVertex(null);
    setDirty(true);
  }

  function placeLabelPoint() {
    const map = mapRef.current;
    if (!map || !draftFeature) return;
    const center = map.getCenter();
    const next = withLabelPoint(draftFeature, [center.lng, center.lat]);
    setDraftFeature(next);
    draftRef.current = next;
    setDirty(true);
    setMessage("Label point placed at the map center. Drag the dark marker to refine it.");
  }

  return (
    <section className="map-editor" aria-label="Map feature editor">
      <header className="editor-header">
        <div>
          <p className="eyebrow">Editorial workspace</p>
          <h1>Geographic map editor</h1>
          <p className="muted">Edit boundaries and label anchors as drafts. Publishing remains a separate, verified step.</p>
        </div>
        <button className="editor-button editor-button-primary" type="button" onClick={startNewFeature}>New feature</button>
      </header>

      <div className="editor-layout">
        <aside className="editor-sidebar">
          <div className="sidebar-heading">
            <div>
              <h2>Features</h2>
              <span className="muted">{features.length} total</span>
            </div>
            <button className="editor-button editor-button-small" type="button" onClick={() => void loadFeatures()} disabled={loadingFeatures}>Refresh</button>
          </div>
          <label className="editor-search">
            <span className="sr-only">Search features</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or slug" />
          </label>
          <div className="feature-list">
            {loadingFeatures ? <p className="muted editor-empty">Loading features…</p> : null}
            {!loadingFeatures && filteredFeatures.length === 0 ? (
              <div className="editor-empty">
                <strong>{features.length ? "No matching features" : "No features yet"}</strong>
                <p className="muted">Create the first geographic feature to begin editing.</p>
              </div>
            ) : null}
            {filteredFeatures.map((feature) => (
              <button key={feature.id} className={`feature-row${selectedId === feature.id ? " is-selected" : ""}`} type="button" onClick={() => void selectFeature(feature.id)}>
                <span className="feature-row-title">{feature.name}</span>
                <span className="feature-row-meta"><span>{feature.feature_type}</span><span>{feature.status}</span></span>
              </button>
            ))}
          </div>
          <section className="release-panel" aria-label="Release pipeline">
            <div className="sidebar-heading">
              <div>
                <h2>Release pipeline</h2>
                <span className="muted">Production generation {releaseGeneration}</span>
              </div>
              <button className="editor-button editor-button-small" type="button" onClick={() => void loadReleases()} disabled={loadingReleases}>Refresh</button>
            </div>
            {loadingReleases ? <p className="muted release-empty">Loading release status…</p> : null}
            {!loadingReleases && !releases.length ? <p className="muted release-empty">No PMTiles release has been published yet.</p> : null}
            {releases.slice(0, 6).map((release) => {
              const job = publishJobs.find((item) => item.release_id === release.id);
              const canRollback = release.status === "superseded" && release.id !== activeReleaseId;
              return (
                <div className="release-row" key={release.id}>
                  <div>
                    <strong>{release.release_key}</strong>
                    <span className="release-meta">gen {release.generation} · {release.status}{job ? ` · job ${job.status}` : ""}</span>
                  </div>
                  <div className="release-actions">
                    {job && ["queued", "failed"].includes(job.status) ? <button className="editor-button editor-button-small" type="button" onClick={() => void dispatchJob(job.id)} disabled={dispatchingJob === job.id}>Dispatch</button> : null}
                    {canRollback ? <button className="editor-button editor-button-small" type="button" onClick={() => void rollbackRelease(release.id)} disabled={rollingBack}>Rollback</button> : null}
                  </div>
                </div>
              );
            })}
          </section>
        </aside>

        <div className="editor-map-panel">
          <div className="editor-map-toolbar">
            <span>{draftFeature ? (draftFeature.id ? `Editing ${draftFeature.name || "unnamed feature"}` : "New draft feature") : "Select a feature to begin"}</span>
            <span className={dirty ? "editor-dirty" : "editor-clean"}>{dirty ? "Unsaved changes" : "Saved"}</span>
          </div>
          <div className="editor-map" ref={mapContainerRef} />
          {mapError ? <p className="editor-map-note">{mapError}</p> : null}
          <div className="editor-help">Drag white vertices to edit the boundary. Drag the dark marker to move the label anchor.</div>
        </div>

        <aside className="editor-inspector">
          {loadingFeature ? <p className="muted">Loading feature…</p> : null}
          {!loadingFeature && !draftFeature ? (
            <div className="editor-empty inspector-empty"><strong>Select a feature</strong><p className="muted">Choose a feature from the list or create a new draft.</p></div>
          ) : null}
          {draftFeature ? (
            <>
              <div className="sidebar-heading"><div><h2>Inspector</h2><span className="muted">Draft v{draftFeature.version || 1}</span></div></div>
              <div className="editor-form">
                <label className="editor-field"><span>Feature type</span><select value={draftFeature.feature_type} onChange={(event) => updateDraftField("feature_type", event.target.value as FeatureType)}>{featureTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                <label className="editor-field"><span>Name</span><input value={draftFeature.name} onChange={(event) => updateDraftField("name", event.target.value)} placeholder="Display name" /></label>
                <label className="editor-field"><span>Vietnamese name</span><input value={draftFeature.name_vi ?? ""} onChange={(event) => updateDraftField("name_vi", event.target.value)} /></label>
                <label className="editor-field"><span>English name</span><input value={draftFeature.name_en ?? ""} onChange={(event) => updateDraftField("name_en", event.target.value)} /></label>
                <label className="editor-field"><span>Slug</span><input value={draftFeature.slug} disabled={Boolean(draftFeature.id)} onChange={(event) => updateDraftField("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} /></label>
                <div className="editor-field-grid">
                  <label className="editor-field"><span>Min zoom</span><input type="number" min={0} max={24} value={draftFeature.min_zoom} onChange={(event) => updateDraftField("min_zoom", Number(event.target.value))} /></label>
                  <label className="editor-field"><span>Max zoom</span><input type="number" min={0} max={24} value={draftFeature.max_zoom} onChange={(event) => updateDraftField("max_zoom", Number(event.target.value))} /></label>
                </div>
                <div className="editor-field-grid">
                  <label className="editor-field"><span>Label min zoom</span><input type="number" min={0} max={24} value={draftFeature.label_min_zoom} onChange={(event) => updateDraftField("label_min_zoom", Number(event.target.value))} /></label>
                  <label className="editor-field"><span>Priority</span><input type="number" min={-10000} max={10000} value={draftFeature.label_priority} onChange={(event) => updateDraftField("label_priority", Number(event.target.value))} /></label>
                </div>
              </div>
              <div className="editor-actions">
                <button className="editor-button editor-button-primary" type="button" onClick={() => void saveDraft()} disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>
                <button className="editor-button editor-button-publish" type="button" onClick={() => void publishDraft()} disabled={publishing || saving || dirty || !draftFeature.id}>{publishing ? "Queueing…" : "Publish revision"}</button>
                <button className="editor-button" type="button" onClick={placeLabelPoint}>Place label point</button>
                <div className="editor-action-row"><button className="editor-button" type="button" onClick={handleAddVertex}>Add vertex</button><button className="editor-button" type="button" onClick={handleRemoveVertex} disabled={!selectedVertex}>Remove vertex</button></div>
              </div>
              {message ? <p className="editor-message" role="status">{message}</p> : null}
              <section className="revision-panel" aria-label="Revision history">
                <div className="sidebar-heading">
                  <div><h2>Revision history</h2><span className="muted">Immutable drafts for rollback-safe publishing</span></div>
                  <button className="editor-button editor-button-small" type="button" onClick={() => void loadRevisions(draftFeature.id)} disabled={loadingRevisions}>Refresh</button>
                </div>
                {loadingRevisions ? <p className="muted release-empty">Loading revisions…</p> : null}
                {!loadingRevisions && !revisions.length ? <p className="muted release-empty">No revisions yet.</p> : null}
                {revisions.map((revision) => {
                  const isCurrent = revision.id === draftFeature.latest_revision_id;
                  return (
                    <div className={`revision-row${isCurrent ? " is-current" : ""}`} key={revision.id}>
                      <div>
                        <strong>v{revision.version}{isCurrent ? " · current" : ""}</strong>
                        <span className="release-meta">{revision.status} · {new Date(revision.created_at).toLocaleString()}</span>
                      </div>
                      {!isCurrent ? <button className="editor-button editor-button-small" type="button" onClick={() => void restoreRevision(revision.id)} disabled={saving || dirty}>Restore</button> : null}
                    </div>
                  );
                })}
              </section>
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
