export type MapFeatureType =
  | "country"
  | "province"
  | "district"
  | "city"
  | "area"
  | "island"
  | "neighbourhood";

export type MapFeatureStatus = "draft" | "published" | "archived";
export type MapReleaseStatus = "building" | "ready" | "active" | "failed" | "superseded";

export interface MapManifest {
  channel: "production";
  generation: number;
  releaseId: string;
  releaseKey: string;
  createdAt: string;
  sources: {
    world: string;
    vietnam: string;
    geo: string;
  };
  styleUrl: string;
  glyphsUrl: string;
  attribution: string;
}

export interface MapReleaseRecord {
  id: string;
  release_key: string;
  generation: number;
  world_version: string;
  vietnam_version: string;
  geo_version: string;
  style_version: string;
  glyphs_version: string;
  status: MapReleaseStatus;
  created_at: string;
}

export const DEFAULT_RELEASE_ID = "bootstrap";
export const DEFAULT_RELEASE_KEY = "bootstrap";

export function mapAssetUrl(baseUrl: string, releaseKey: string, asset: string): string {
  return `${baseUrl.replace(/\/$/, "")}/releases/${encodeURIComponent(releaseKey)}/${asset}`;
}
