import { describe, expect, it } from "vitest";
import type { ConstructionSiteWithGeometry } from "../src/types/index.ts";
import { splitConstructionSiteGeometries } from "../src/pipeline/construction-site-geometries.ts";
import { createConstructionSite } from "./fixtures.ts";

const withGeometry = (
  id: string,
  geometry: ConstructionSiteWithGeometry["geometry"],
): ConstructionSiteWithGeometry => ({ ...createConstructionSite(id), geometry });

describe("construction-site geometry split", () => {
  const sites = [
    withGeometry("site-1", {
      type: "LineString",
      coordinates: [
        [8.4, 49],
        [8.41, 49.01],
      ],
    }),
    withGeometry("site-2", { type: "Point", coordinates: [8.42, 49.02] }),
  ];

  it("keys every geometry by its record id", () => {
    const { geometries } = splitConstructionSiteGeometries(sites);
    expect(Object.keys(geometries)).toEqual(["site-1", "site-2"]);
    expect(geometries["site-2"]).toEqual({
      type: "Point",
      coordinates: [8.42, 49.02],
    });
  });

  it("leaves no geometry behind in the published records", () => {
    // The whole point of the split: the list file is what every visitor
    // downloads, and it must not carry the seven eighths only a map reads.
    const { constructionSites } = splitConstructionSiteGeometries(sites);
    for (const site of constructionSites) {
      expect(Object.hasOwn(site, "geometry")).toBe(false);
    }
    expect(constructionSites.map((site) => site.id)).toEqual([
      "site-1",
      "site-2",
    ]);
  });

  it("does not modify its input", () => {
    splitConstructionSiteGeometries(sites);
    expect(sites[0].geometry).toEqual({
      type: "LineString",
      coordinates: [
        [8.4, 49],
        [8.41, 49.01],
      ],
    });
  });
});
