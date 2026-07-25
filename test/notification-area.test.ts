import { describe, expect, it } from "vitest";
import {
  isNotificationArea,
  findNewConstructionSitesInArea,
  isPointInNotificationArea,
} from "../src/lib/notification-area.ts";
import { isLngLat } from "../src/lib/notification-area-validation.ts";
import type {
  ConstructionSite,
  NotificationArea,
} from "../src/types/index.ts";

const area: NotificationArea = {
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
    geometry: { type: "Point", coordinates: point },
    source: "Test",
    lastModified: "2026-07-24T00:00:00Z",
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
    expect(isNotificationArea(area)).toBe(true);
    expect(isNotificationArea({ ...area, radiusKm: 0 })).toBe(false);
    expect(isNotificationArea({ ...area, center: [181, 49] })).toBe(false);
  });

  it("matches points inside the configured radius", () => {
    expect(isPointInNotificationArea(area, [8.45, 49.0069])).toBe(true);
    expect(isPointInNotificationArea(area, [8.5, 49.0069])).toBe(false);
  });

  it("returns only added construction sites inside the radius", () => {
    const nearby = createConstructionSite("nearby", [8.41, 49.01]);
    const farAway = createConstructionSite("far", [8.6, 49.01]);
    const unchanged = createConstructionSite("unchanged", [8.42, 49.01]);

    expect(
      findNewConstructionSitesInArea(
        [nearby, farAway, unchanged],
        new Set(["nearby", "far"]),
        area,
      ).map(({ id }) => id),
    ).toEqual(["nearby"]);
  });
});
