import { describe, expect, it } from "vitest";
import { getMunicipalityCenter } from "../src/lib/municipality-center.ts";
import type { ConstructionSite, LngLat } from "../src/types/index.ts";

function createConstructionSite(
  id: string,
  municipality: string,
  point: LngLat,
): ConstructionSite {
  return {
    id,
    point,
    phase: "active",
    category: "road-construction",
    artRaw: "Straßenbau",
    closure: "none",
    siteType: "stationary",
    municipality,
    location: "Teststraße",
    notes: null,
    cause: null,
    startDate: "2026-08-01",
    endDate: null,
    source: "Test",
    lastModified: "2026-07-24T00:00:00Z",
    firstSeenAt: "2026-07-24T00:00:00Z",
  };
}

const constructionSites = [
  createConstructionSite("a", "Karlsruhe", [8.4, 49.0]),
  createConstructionSite("b", "Karlsruhe", [8.42, 49.02]),
  createConstructionSite("c", "Bruchsal", [8.6, 49.13]),
];

describe("getMunicipalityCenter", () => {
  it("averages the representative points of one municipality", () => {
    expect(getMunicipalityCenter(constructionSites, "Karlsruhe")).toEqual([
      8.41, 49.01,
    ]);
  });

  it("returns undefined for a municipality without records", () => {
    expect(
      getMunicipalityCenter(constructionSites, "Rheinstetten"),
    ).toBeUndefined();
  });

  it("rounds like every other notification-area center", () => {
    expect(
      getMunicipalityCenter(
        [createConstructionSite("d", "Ettlingen", [8.4044123, 49.0069987])],
        "Ettlingen",
      ),
    ).toEqual([8.404, 49.007]);
  });
});
