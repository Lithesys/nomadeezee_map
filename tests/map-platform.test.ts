import { describe, expect, it } from "vitest";

import { mapAssetUrl } from "@/lib/map/types";

describe("map asset URLs", () => {
  it("creates an immutable, encoded release path", () => {
    expect(mapAssetUrl("https://tiles.example.com/", "g42/demo", "geo.pmtiles"))
      .toBe("https://tiles.example.com/releases/g42%2Fdemo/geo.pmtiles");
  });
});
