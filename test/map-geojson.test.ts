import type { Point } from "geojson";
import { describe, expect, it } from "vitest";
import { distanceInMeters } from "../src/lib/distance.ts";
import {
  createConstructionSiteGeometryFeatureCollection,
  createConstructionSitePointFeatureCollection,
  createNotificationAreaFeatureCollection,
  createNotificationAreaPolygon,
  createUserLocationFeatureCollection,
} from "../src/lib/map-geojson.ts";
import type {
  ConstructionSite,
  ConstructionSiteGeometries,
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
        closure: constructionSite.closure,
        isFullClosure: 0,
      },
    });
    expect(geometryFeature?.geometry).toEqual(geometries[constructionSite.id]);
    expect(geometryFeature?.properties.closure).toBe(constructionSite.closure);
  });

  it("skips sites whose geometry has not been loaded yet", () => {
    const withoutGeometry = { ...constructionSite, id: "site-without" };

    expect(
      createConstructionSiteGeometryFeatureCollection(
        [constructionSite, withoutGeometry],
        geometries,
      ).features.map((feature) => feature.id),
    ).toEqual([constructionSite.id]);
    expect(
      createConstructionSiteGeometryFeatureCollection(
        [constructionSite],
        undefined,
      ).features,
    ).toEqual([]);
  });

  it("marks full closures numerically so a cluster can sum them", () => {
    const [mild, severe] = createConstructionSitePointFeatureCollection([
      constructionSite,
      { ...constructionSite, id: "site-2", closure: "full" },
    ]).features;

    expect(mild?.properties.isFullClosure).toBe(0);
    expect(severe?.properties.isFullClosure).toBe(1);
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
    const area = {
      center: [8.4044, 49.0069] as [number, number],
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

  it("adds one label point per named area: atop a circle, halfway along a route", () => {
    const { features } = createNotificationAreaFeatureCollection([
      { kind: "circle", label: "Zuhause", center: [8.4, 49.0], radiusKm: 1 },
      {
        kind: "corridor",
        label: "Arbeitsweg",
        line: [
          [8.39, 49.0],
          [8.41, 49.0],
        ],
        widthMeters: 250,
      },
      { kind: "street", label: "Kaiserstraße", street: "Kaiserstraße", municipality: "Karlsruhe" },
    ]);
    expect(features.map((feature) => [feature.geometry.type, feature.properties.label])).toEqual([
      ["Polygon", undefined],
      ["Point", "Zuhause"],
      ["LineString", undefined],
      ["Point", "Arbeitsweg"],
    ]);
    const [, top, , middle] = features.map((feature) => feature.geometry);
    expect((top as Point).coordinates[0]).toBeCloseTo(8.4, 5);
    expect((top as Point).coordinates[1]).toBeCloseTo(49.009, 3);
    expect((middle as Point).coordinates).toEqual([8.4, 49.0]);
  });

  it("draws a corridor's way back as a second line", () => {
    const { features } = createNotificationAreaFeatureCollection([
      {
        kind: "corridor",
        line: [
          [8.39, 49.0],
          [8.41, 49.0],
        ],
        returnLine: [
          [8.41, 49.01],
          [8.39, 49.01],
        ],
        widthMeters: 250,
      },
    ]);
    expect(features.map((feature) => feature.geometry.type)).toEqual([
      "LineString",
      "LineString",
    ]);
  });

  it("renders one polygon per configured area, none when there are none", () => {
    expect(createNotificationAreaFeatureCollection([]).features).toEqual([]);
    expect(
      createNotificationAreaFeatureCollection([
        { kind: "circle", center: [8.4044, 49.0069], radiusKm: 5 },
        { kind: "circle", center: [8.5, 49.1], radiusKm: 2 },
      ]).features,
    ).toHaveLength(2);
  });
});
