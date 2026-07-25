import { describe, expect, it } from "vitest";
import { distanceInMeters } from "../src/lib/distance.ts";
import {
  constructionSitesToGeometryFeatures,
  constructionSitesToPointFeatures,
  createNotificationAreaFeatureCollection,
  createNotificationAreaPolygon,
  createUserLocationFeatureCollection,
} from "../src/lib/map-geojson.ts";
import type {
  ConstructionSite,
  NotificationArea,
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
  geometry: {
    type: "LineString",
    coordinates: [
      [8.4037, 49.0094],
      [8.404, 49.01],
    ],
  },
  source: "Test",
  lastModified: "2026-07-24T10:00:00Z",
};

describe("map data", () => {
  it("creates point and full-geometry features with shared map properties", () => {
    const pointFeature = constructionSitesToPointFeatures([
      constructionSite,
    ]).features[0];
    const geometryFeature = constructionSitesToGeometryFeatures([
      constructionSite,
    ]).features[0];

    expect(pointFeature).toMatchObject({
      id: constructionSite.id,
      geometry: { type: "Point", coordinates: constructionSite.point },
      properties: {
        id: constructionSite.id,
        phase: constructionSite.phase,
      },
    });
    expect(geometryFeature?.geometry).toEqual(constructionSite.geometry);
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
    const area: NotificationArea = {
      center: [8.4044, 49.0069],
      radiusKm: 5,
    };
    const ring = createNotificationAreaPolygon(area).coordinates[0];

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
    expect(createNotificationAreaFeatureCollection().features).toEqual([]);
    expect(
      createNotificationAreaFeatureCollection({
        center: [8.4044, 49.0069],
        radiusKm: 5,
      }).features,
    ).toHaveLength(1);
  });
});
