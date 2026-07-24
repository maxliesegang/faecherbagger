import { describe, expect, it } from "vitest";
import {
  isNotificationArea,
  matchingNewBaustellen,
  notificationAreaContains,
} from "../src/lib/notification-area.ts";
import type { Baustelle, NotificationArea } from "../src/types/index.ts";

const area: NotificationArea = {
  center: [8.4044, 49.0069],
  radiusKm: 5,
};

function record(id: string, point: [number, number]): Baustelle {
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
  it("validates coordinate and radius bounds", () => {
    expect(isNotificationArea(area)).toBe(true);
    expect(isNotificationArea({ ...area, radiusKm: 0 })).toBe(false);
    expect(isNotificationArea({ ...area, center: [181, 49] })).toBe(false);
  });

  it("matches points inside the configured radius", () => {
    expect(notificationAreaContains(area, [8.45, 49.0069])).toBe(true);
    expect(notificationAreaContains(area, [8.5, 49.0069])).toBe(false);
  });

  it("returns only added Baustellen inside the radius", () => {
    const nearby = record("nearby", [8.41, 49.01]);
    const farAway = record("far", [8.6, 49.01]);
    const unchanged = record("unchanged", [8.42, 49.01]);

    expect(
      matchingNewBaustellen(
        [nearby, farAway, unchanged],
        new Set(["nearby", "far"]),
        area,
      ).map(({ id }) => id),
    ).toEqual(["nearby"]);
  });
});
