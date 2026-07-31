import { describe, expect, it } from "vitest";
import { distanceInMeters } from "../src/shared/distance.ts";
import {
  createConstructionSiteGeometryFeatureCollection,
  createConstructionSitePointFeatureCollection,
  createHomeAreaFeatureCollection,
  createHomeAreaPolygon,
  createUserLocationFeatureCollection,
} from "../src/lib/map-geojson.ts";
import type {
  ConstructionSite,
  ConstructionSiteGeometries,
  HomeArea,
} from "../src/types/index.ts";

const constructionSite: ConstructionSite = {
  id: "site-1",
  phase: "active",
  category: "road-construction",
  artRaw: "Straßenbau",
  closure: "obstruction",
  siteType: "stationary",
  municipality: "Karlsruhe",
  location: "Marktplatz",
  notes: null,
  cause: null,
  startDate: "2026-07-24",
  endDate: null,
  point: [8.4037, 49.0094],
  source: "Test",
  lastModified: "2026-07-24T10:00:00Z",
  firstSeenAt: "2026-07-24T10:00:00Z",
};

const geometries: ConstructionSiteGeometries = {
  [constructionSite.id]: {
    type: "LineString",
    coordinates: [
      [8.4037, 49.0094],
      [8.404, 49.01],
    ],
  },
};

describe("map data", () => {
  it("creates point and full-geometry features with shared map properties", () => {
    const pointFeature = createConstructionSitePointFeatureCollection([
      constructionSite,
    ]).features[0];
    const geometryFeature = createConstructionSiteGeometryFeatureCollection(
      [constructionSite],
      geometries,
    ).features[0];

    expect(pointFeature).toMatchObject({
      id: constructionSite.id,
      geometry: { type: "Point", coordinates: constructionSite.point },
      properties: {
        id: constructionSite.id,
        phase: constructionSite.phase,
      },
    });
    expect(geometryFeature?.geometry).toEqual(geometries[constructionSite.id]);
  });

  it("omits records whose geometry has not been loaded yet", () => {
    // The normal state of the first paint: the geometry file is fetched when a
    // map appears, and until it lands every record is drawn as a point.
    expect(
      createConstructionSiteGeometryFeatureCollection([constructionSite], {})
        .features,
    ).toEqual([]);
  });

  it("represents an absent or present user location consistently", () => {
    expect(createUserLocationFeatureCollection().features).toEqual([]);
    expect(
      createUserLocationFeatureCollection(constructionSite.point).features[0]
        ?.geometry,
    ).toEqual({
      type: "Point",
      coordinates: constructionSite.point,
    });
  });

  it("creates a closed geodesic notification polygon at the requested radius", () => {
    const area: HomeArea = {
      center: [8.4044, 49.0069],
      radiusKm: 5,
    };
    const ring = createHomeAreaPolygon(area).coordinates[0];

    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring.at(-1));
    for (const point of ring) {
      expect(distanceInMeters(area.center, point as [number, number])).toBeCloseTo(
        5_000,
        -1,
      );
    }
  });

  it("uses an empty feature collection when no area is configured", () => {
    expect(createHomeAreaFeatureCollection().features).toEqual([]);
    expect(
      createHomeAreaFeatureCollection({
        center: [8.4044, 49.0069],
        radiusKm: 5,
      }).features,
    ).toHaveLength(1);
  });
});
