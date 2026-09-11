import { describe, expect, it } from "vitest";

import { mapAssetUrl } from "@/lib/map/types";
import { plainMapStyle } from "@/lib/map/style";
import type { MapManifest } from "@/lib/map/types";

describe("map asset URLs", () => {
  it("creates an immutable, encoded release path", () => {
    expect(mapAssetUrl("https://tiles.example.com/", "g42/demo", "geo.pmtiles"))
      .toBe("https://tiles.example.com/releases/g42%2Fdemo/geo.pmtiles");
  });

  it("keeps custom editor data in separately addressable source layers", () => {
    const manifest: MapManifest = {
      channel: "production",
      generation: 2,
      releaseId: "release-id",
      releaseKey: "g2-demo",
      createdAt: new Date(0).toISOString(),
      sources: {
        world: "https://tiles.example.com/world.pmtiles",
        vietnam: "https://tiles.example.com/vietnam.pmtiles",
        geo: "https://tiles.example.com/geo.pmtiles",
      },
      styleUrl: "/api/styles/plain.json",
      glyphsUrl: "https://tiles.example.com/fonts/{fontstack}/{range}.pbf",
      attribution: "OpenStreetMap contributors",
    };
    const style = plainMapStyle(manifest) as { layers: Array<{ id: string; source?: string; "source-layer"?: string }> };
    const customLayers = style.layers.filter((layer) => layer.source === "nomadeezee_geo").map((layer) => layer["source-layer"]);
    expect(customLayers).toEqual(["boundaries", "labels"]);
  });
});
