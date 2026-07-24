import { describe, expect, it } from "vitest";
import { distanceInMeters } from "../src/lib/distance.ts";
import {
  notificationAreaGeoJson,
  notificationAreaPolygon,
  recordsToGeometries,
  recordsToPoints,
  userLocationGeoJson,
} from "../src/lib/map-data.ts";
import type { Baustelle, NotificationArea } from "../src/types/index.ts";

const record: Baustelle = {
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
    const pointFeature = recordsToPoints([record]).features[0];
    const geometryFeature = recordsToGeometries([record]).features[0];

    expect(pointFeature).toMatchObject({
      id: record.id,
      geometry: { type: "Point", coordinates: record.point },
      properties: { id: record.id, phase: record.phase },
    });
    expect(geometryFeature?.geometry).toEqual(record.geometry);
  });

  it("represents an absent or present user location consistently", () => {
    expect(userLocationGeoJson().features).toEqual([]);
    expect(userLocationGeoJson(record.point).features[0]?.geometry).toEqual({
      type: "Point",
      coordinates: record.point,
    });
  });

  it("creates a closed geodesic notification polygon at the requested radius", () => {
    const area: NotificationArea = {
      center: [8.4044, 49.0069],
      radiusKm: 5,
    };
    const ring = notificationAreaPolygon(area).coordinates[0];

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
    expect(notificationAreaGeoJson().features).toEqual([]);
    expect(
      notificationAreaGeoJson({
        center: [8.4044, 49.0069],
        radiusKm: 5,
      }).features,
    ).toHaveLength(1);
  });
});
