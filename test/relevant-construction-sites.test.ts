import { describe, expect, it } from "vitest";
import type { ConstructionSite, NotificationArea } from "../src/types/index.ts";
import {
  findAreaMatches,
  selectRelevantConstructionSites,
} from "../src/lib/relevant-construction-sites.ts";

function createConstructionSite(
  overrides: Partial<ConstructionSite> = {},
): ConstructionSite {
  return {
    id: "X",
    phase: "active",
    category: "other",
    artRaw: "",
    closure: "unknown",
    siteType: null,
    municipality: "Karlsruhe",
    location: "",
    notes: null,
    cause: null,
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    point: [8.4, 49],
    source: "Stadt Karlsruhe",
    lastModified: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

const TODAY = "2026-07-15";

/** Karlsruhe Marktplatz, and a point roughly 2 km north of it. */
const HOME: NotificationArea = {
  id: "home",
  label: "Zuhause",
  center: [8.4037, 49.0094],
  radiusKm: 5,
};
const WORK: NotificationArea = {
  id: "work",
  label: "Arbeit",
  center: [8.4037, 49.03],
  radiusKm: 3,
};

describe("findAreaMatches", () => {
  it("returns every containing area, nearest centre first", () => {
    // Between the two centres, inside both radii.
    const matches = findAreaMatches([HOME, WORK], [8.4037, 49.025]);
    expect(matches.map(({ area }) => area.id)).toEqual(["work", "home"]);
  });

  it("is empty when the point lies outside every radius", () => {
    expect(findAreaMatches([HOME], [8.4037, 49.4])).toEqual([]);
  });
});

describe("selectRelevantConstructionSites", () => {
  it("keeps only sites inside a watched area", () => {
    const near = createConstructionSite({ id: "near", point: [8.4037, 49.02] });
    const far = createConstructionSite({ id: "far", point: [8.4037, 49.4] });
    const selection = selectRelevantConstructionSites([near, far], [HOME], {
      today: TODAY,
    });
    expect(selection.all.map((r) => r.constructionSite.id)).toEqual(["near"]);
  });

  it("keeps a followed site however far away it is, with no distance", () => {
    const far = createConstructionSite({ id: "far", point: [8.4037, 49.4] });
    const selection = selectRelevantConstructionSites([far], [HOME], {
      today: TODAY,
      followedSiteIds: new Set(["far"]),
    });
    expect(selection.all).toHaveLength(1);
    expect(selection.all[0]!.distanceMeters).toBeNull();
    expect(selection.all[0]!.areas).toEqual([]);
    expect(selection.followed.map((r) => r.constructionSite.id)).toEqual(["far"]);
  });

  it("records both reasons for a followed site that is also nearby", () => {
    const near = createConstructionSite({ id: "near", point: [8.4037, 49.02] });
    const selection = selectRelevantConstructionSites([near], [HOME], {
      today: TODAY,
      followedSiteIds: new Set(["near"]),
    });
    expect(selection.all[0]!.isFollowed).toBe(true);
    expect(selection.all[0]!.distanceMeters).toBeGreaterThan(0);
  });

  it("selects nothing when no area is watched and nothing is followed", () => {
    const near = createConstructionSite({ id: "near", point: [8.4037, 49.02] });
    expect(
      selectRelevantConstructionSites([near], [], { today: TODAY }).all,
    ).toEqual([]);
  });

  it("orders by distance and puts followed-only sites last", () => {
    const close = createConstructionSite({ id: "close", point: [8.4037, 49.011] });
    const further = createConstructionSite({ id: "further", point: [8.4037, 49.03] });
    const followedOnly = createConstructionSite({
      id: "followed",
      point: [8.4037, 49.4],
    });
    const selection = selectRelevantConstructionSites(
      [followedOnly, further, close],
      [HOME],
      { today: TODAY, followedSiteIds: new Set(["followed"]) },
    );
    expect(selection.all.map((r) => r.constructionSite.id)).toEqual([
      "close",
      "further",
      "followed",
    ]);
  });

  it("buckets by timing against the supplied day", () => {
    const running = createConstructionSite({
      id: "running",
      point: [8.4037, 49.011],
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
    const startsSoon = createConstructionSite({
      id: "soon",
      point: [8.4037, 49.011],
      startDate: "2026-07-18",
      endDate: "2026-08-31",
    });
    const later = createConstructionSite({
      id: "later",
      point: [8.4037, 49.011],
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
    const ended = createConstructionSite({
      id: "ended",
      point: [8.4037, 49.011],
      startDate: "2026-05-01",
      endDate: "2026-06-01",
    });
    const selection = selectRelevantConstructionSites(
      [running, startsSoon, later, ended],
      [HOME],
      { today: TODAY },
    );
    expect(selection.running.map((r) => r.constructionSite.id)).toEqual([
      "running",
    ]);
    expect(selection.planned.map((r) => r.constructionSite.id)).toEqual([
      "soon",
      "later",
    ]);
    // Started two weeks ago, so no longer short notice; "later" is too far off.
    expect(selection.shortNotice.map((r) => r.constructionSite.id)).toEqual([
      "soon",
    ]);
  });

  it("ranks short notice by urgency before distance", () => {
    // The nearer site starts in six days, the further one tomorrow.
    const nearerLater = createConstructionSite({
      id: "nearer-later",
      point: [8.4037, 49.011],
      startDate: "2026-07-21",
      endDate: null,
    });
    const furtherSooner = createConstructionSite({
      id: "further-sooner",
      point: [8.4037, 49.04],
      startDate: "2026-07-16",
      endDate: null,
    });
    const selection = selectRelevantConstructionSites(
      [nearerLater, furtherSooner],
      [HOME],
      { today: TODAY },
    );
    expect(selection.shortNotice.map((r) => r.constructionSite.id)).toEqual([
      "further-sooner",
      "nearer-later",
    ]);
  });

  it("marks sites changed in the last run, for the card badge", () => {
    const changed = createConstructionSite({
      id: "changed",
      point: [8.4037, 49.011],
    });
    const untouched = createConstructionSite({
      id: "untouched",
      point: [8.4037, 49.012],
    });
    const selection = selectRelevantConstructionSites(
      [changed, untouched],
      [HOME],
      { today: TODAY, changedSiteIds: new Set(["changed"]) },
    );
    expect(
      selection.all
        .filter((r) => r.isChanged)
        .map((r) => r.constructionSite.id),
    ).toEqual(["changed"]);
    expect(selection.changedCount).toBe(1);
  });

  it("counts no change when the run reported none", () => {
    // The tab badge reads this, so it has to return to zero between runs.
    const site = createConstructionSite({ id: "a", point: [8.4037, 49.011] });
    expect(
      selectRelevantConstructionSites([site], [HOME], { today: TODAY })
        .changedCount,
    ).toBe(0);
  });

  it("does not count a change outside the watched areas", () => {
    const far = createConstructionSite({ id: "far", point: [8.4037, 49.4] });
    expect(
      selectRelevantConstructionSites([far], [HOME], {
        today: TODAY,
        changedSiteIds: new Set(["far"]),
      }).changedCount,
    ).toBe(0);
  });

  it("does not modify the input array", () => {
    const sites = [
      createConstructionSite({ id: "b", point: [8.4037, 49.03] }),
      createConstructionSite({ id: "a", point: [8.4037, 49.011] }),
    ];
    const order = sites.map((site) => site.id);
    selectRelevantConstructionSites(sites, [HOME], { today: TODAY });
    expect(sites.map((site) => site.id)).toEqual(order);
  });
});
