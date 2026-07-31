import { describe, expect, it } from "vitest";
import {
  isHomeArea,
  selectConstructionSitesInArea,
  isPointInHomeArea,
} from "../src/shared/home-area.ts";
import {
  isLngLat,
  roundHomeAreaCenter,
} from "../src/shared/home-area-validation.ts";
import type {
  ConstructionSite,
  HomeArea,
} from "../src/types/index.ts";

const area: HomeArea = {
  center: [8.4044, 49.0069],
  radiusKm: 5,
};

function createConstructionSite(id: string, point: [number, number]): ConstructionSite {
  return {
    id,
    point,
    phase: "upcoming",
    category: "road-construction",
    artRaw: "Straßenbau",
    closure: "obstruction",
    siteType: "stationary",
    municipality: "Karlsruhe",
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

describe("notification area", () => {
  it("validates GeoJSON coordinates", () => {
    expect(isLngLat([8.4044, 49.0069])).toBe(true);
    expect(isLngLat([181, 49])).toBe(false);
    expect(isLngLat([8.4, Number.NaN])).toBe(false);
    expect(isLngLat([8.4])).toBe(false);
  });

  it("validates coordinate and radius bounds", () => {
    expect(isHomeArea(area)).toBe(true);
    expect(isHomeArea({ ...area, radiusKm: 0 })).toBe(false);
    expect(isHomeArea({ ...area, center: [181, 49] })).toBe(false);
  });

  it("coarsens a center to about 100 m before it is stored or sent", () => {
    expect(roundHomeAreaCenter([8.4044123, 49.0069987])).toEqual([
      8.404, 49.007,
    ]);
    // A coarsened center must stay a valid area, otherwise storing it would
    // reject the very value the app produces.
    expect(
      isHomeArea({
        center: roundHomeAreaCenter([8.4044123, 49.0069987]),
        radiusKm: 5,
      }),
    ).toBe(true);
  });

  it("matches points inside the configured radius", () => {
    expect(isPointInHomeArea(area, [8.45, 49.0069])).toBe(true);
    expect(isPointInHomeArea(area, [8.5, 49.0069])).toBe(false);
  });

  it("keeps only the candidates inside the radius", () => {
    const nearby = createConstructionSite("nearby", [8.41, 49.01]);
    const farAway = createConstructionSite("far", [8.6, 49.01]);

    expect(
      selectConstructionSitesInArea([nearby, farAway], area).map(
        ({ id }) => id,
      ),
    ).toEqual(["nearby"]);
  });

  it("leaves the input untouched", () => {
    const constructionSites = [
      createConstructionSite("far", [8.6, 49.01]),
      createConstructionSite("nearby", [8.41, 49.01]),
    ];
    selectConstructionSitesInArea(constructionSites, area);

    expect(constructionSites.map(({ id }) => id)).toEqual(["far", "nearby"]);
  });
});
