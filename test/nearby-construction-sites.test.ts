import { describe, expect, it } from "vitest";
import {
  countUnseenConstructionSiteChanges,
  isUnseenConstructionSiteChange,
  selectChangedNearbyConstructionSites,
  selectNearbyConstructionSites,
} from "../src/lib/nearby-construction-sites.ts";
import type {
  ConstructionSite,
  ConstructionSiteChanges,
  LngLat,
  NotificationArea,
} from "../src/types/index.ts";

const area: NotificationArea = { center: [8.4044, 49.0069], radiusKm: 5 };

function createConstructionSite(
  id: string,
  point: LngLat,
  overrides: Partial<ConstructionSite> = {},
): ConstructionSite {
  return {
    id,
    point,
    phase: "active",
    category: "road-construction",
    artRaw: "Straßenbau",
    closure: "obstruction",
    siteType: "stationary",
    municipality: "Karlsruhe",
    location: `Teststraße ${id}`,
    notes: null,
    cause: null,
    startDate: "2026-08-01",
    endDate: null,
    geometry: { type: "Point", coordinates: point },
    source: "Test",
    lastModified: "2026-07-24T00:00:00Z",
    ...overrides,
  };
}

const nearestSite = createConstructionSite("nearest", [8.405, 49.007]);
const middleSite = createConstructionSite("middle", [8.42, 49.01], {
  phase: "upcoming",
});
const farSite = createConstructionSite("far", [8.7, 49.1]);

const changes: ConstructionSiteChanges = {
  since: "2026-07-20T00:00:00Z",
  added: [{ id: "middle", detectedAt: "2026-07-27T06:00:00Z" }],
  modified: [{ id: "nearest", detectedAt: "2026-07-22T06:00:00Z" }],
  removed: [],
};

describe("selectNearbyConstructionSites", () => {
  it("keeps only sites inside the area and orders them by distance", () => {
    const nearby = selectNearbyConstructionSites(
      [farSite, middleSite, nearestSite],
      area,
    );

    expect(nearby.map((entry) => entry.site.id)).toEqual([
      "nearest",
      "middle",
    ]);
    expect(nearby[0].distanceMeters).toBeLessThan(nearby[1].distanceMeters);
  });

  it("annotates the change status and detection time", () => {
    const nearby = selectNearbyConstructionSites(
      [nearestSite, middleSite],
      area,
      changes,
    );

    expect(nearby.map((entry) => entry.changeStatus)).toEqual([
      "modified",
      "added",
    ]);
    expect(nearby[1].detectedAt).toBe("2026-07-27T06:00:00Z");
  });

  it("reports no changes for a first run without a comparison base", () => {
    const nearby = selectNearbyConstructionSites(
      [nearestSite, middleSite],
      area,
      { ...changes, since: null },
    );

    expect(nearby.every((entry) => entry.changeStatus === null)).toBe(true);
  });

  it("leaves the input untouched", () => {
    const constructionSites = [farSite, middleSite, nearestSite];
    selectNearbyConstructionSites(constructionSites, area, changes);

    expect(constructionSites.map((site) => site.id)).toEqual([
      "far",
      "middle",
      "nearest",
    ]);
  });
});

describe("selectChangedNearbyConstructionSites", () => {
  it("keeps only changed sites, newest detection first", () => {
    const changed = selectChangedNearbyConstructionSites(
      selectNearbyConstructionSites(
        [nearestSite, middleSite, farSite],
        area,
        changes,
      ),
    );

    expect(changed.map((entry) => entry.site.id)).toEqual([
      "middle",
      "nearest",
    ]);
  });

  it("falls back to distance for changes detected in the same run", () => {
    const sameRun: ConstructionSiteChanges = {
      since: "2026-07-20T00:00:00Z",
      added: [
        { id: "middle", detectedAt: "2026-07-27T06:00:00Z" },
        { id: "nearest", detectedAt: "2026-07-27T06:00:00Z" },
      ],
      modified: [],
      removed: [],
    };

    expect(
      selectChangedNearbyConstructionSites(
        selectNearbyConstructionSites(
          [middleSite, nearestSite],
          area,
          sameRun,
        ),
      ).map((entry) => entry.site.id),
    ).toEqual(["nearest", "middle"]);
  });
});

describe("unseen changes", () => {
  it("counts every change when nothing was acknowledged yet", () => {
    const changed = selectChangedNearbyConstructionSites(
      selectNearbyConstructionSites([nearestSite, middleSite], area, changes),
    );

    expect(countUnseenConstructionSiteChanges(changed, null)).toBe(2);
    expect(
      countUnseenConstructionSiteChanges(changed, "2026-07-25T00:00:00Z"),
    ).toBe(1);
    expect(
      countUnseenConstructionSiteChanges(changed, "2026-07-28T00:00:00Z"),
    ).toBe(0);
  });

  it("treats an unchanged site as seen", () => {
    expect(isUnseenConstructionSiteChange(null, null)).toBe(false);
  });
});
