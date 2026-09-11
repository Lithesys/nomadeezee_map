import type { MapManifest } from "@/lib/map/types";

export function plainMapStyle(manifest: MapManifest) {
  return {
    version: 8,
    name: "Nomadeezee Plain",
    metadata: {
      "nomadeezee:release": manifest.releaseId,
      "nomadeezee:generation": manifest.generation,
    },
    glyphs: manifest.glyphsUrl,
    sources: {
      world: { type: "vector", url: `pmtiles://${manifest.sources.world}` },
      vietnam: { type: "vector", url: `pmtiles://${manifest.sources.vietnam}` },
      nomadeezee_geo: { type: "vector", url: `pmtiles://${manifest.sources.geo}` },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#f4f7f3" } },
      { id: "world-land", type: "fill", source: "world", "source-layer": "land", paint: { "fill-color": "#e7eee7" } },
      { id: "vietnam-land", type: "fill", source: "vietnam", "source-layer": "landcover", paint: { "fill-color": "#e7eee7" } },
      { id: "world-water", type: "fill", source: "world", "source-layer": "water", paint: { "fill-color": "#cfe6ea" } },
      { id: "vietnam-water", type: "fill", source: "vietnam", "source-layer": "water", paint: { "fill-color": "#cfe6ea" } },
      { id: "vietnam-roads", type: "line", source: "vietnam", "source-layer": "transportation", minzoom: 6, paint: { "line-color": "#c0cbc5", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 14, 3] } },
      { id: "world-boundaries", type: "line", source: "world", "source-layer": "boundary", paint: { "line-color": "#9eafa8", "line-width": 0.8 } },
      { id: "custom-boundaries", type: "line", source: "nomadeezee_geo", "source-layer": "boundaries", paint: { "line-color": "#526d64", "line-width": 1.4 } },
      { id: "custom-place-names", type: "symbol", source: "nomadeezee_geo", "source-layer": "labels", layout: { "text-field": ["coalesce", ["get", "name_vi"], ["get", "name"]], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 12, 16], "text-font": ["Be Vietnam Pro Regular"], "text-anchor": "center", "text-allow-overlap": false }, paint: { "text-color": "#24453e", "text-halo-color": "#f7faf7", "text-halo-width": 1.5 } },
    ],
  };
}
