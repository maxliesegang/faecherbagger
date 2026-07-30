import { describe, expect, it } from "vitest";
import {
  EMPTY_SITE_SELECTION,
  selectSites,
} from "../src/lib/select-sites.ts";
import { isUnseenConstructionSite } from "../src/shared/recency.ts";
import {
  MATCHES_NOTHING,
  createAreaScope,
  createRecentWindow,
  type SiteScope,
} from "../src/lib/site-scope.ts";
import { EMPTY_CONSTRUCTION_SITE_FILTERS } from "../src/lib/construction-site-filter.ts";
import type { ConstructionSite, HomeArea } from "../src/types/index.ts";
import { createConstructionSite } from "./fixtures.ts";

const FETCHED_AT = "2026-07-25T06:00:00.000Z";
const area: HomeArea = { center: [8.4044, 49.0069], radiusKm: 5 };

/** A 7 d window: `since` and `badgeSince` coincide, since 7 is the default. */
const sevenDayWindow = createRecentWindow(FETCHED_AT, 7);
/** A 30 d window: `since` reaches further back than `badgeSince` does. */
const thirtyDayWindow = createRecentWindow(FETCHED_AT, 30);


/** Both introduced by the same run, so only distance separates them. */
const nearSite = createConstructionSite("near", { point: [8.405, 49.007] });
const midSite = createConstructionSite("mid", { point: [8.42, 49.01], phase: "upcoming" });
/** Inside the area, but first seen 24 days ago: new in 30 d, not in 7 d. */
const olderSite = createConstructionSite("older", {
  point: [8.406, 49.008],
  firstSeenAt: "2026-07-01T06:00:00.000Z",
});
/** Known since long before any window. */
const ancientSite = createConstructionSite("ancient", {
  point: [8.407, 49.009],
  firstSeenAt: "2026-01-01T00:00:00.000Z",
});
const farSite = createConstructionSite("far", { point: [8.7, 49.1] });

const allSites = [farSite, midSite, ancientSite, nearSite, olderSite];

const ids = (entries: readonly { site: ConstructionSite }[]): string[] =>
  entries.map((entry) => entry.site.id);

describe("createRecentWindow", () => {
  it("anchors both starts to the data timestamp, not the wall clock", () => {
    expect(sevenDayWindow.since).toBe("2026-07-18T06:00:00.000Z");
    expect(sevenDayWindow.badgeSince).toBe("2026-07-18T06:00:00.000Z");
  });

  it("holds the badge start at the default window when the visitor widens theirs", () => {
    // The unread badge must not change because someone picked a different
    // time filter, so `badgeSince` ignores `days`.
    expect(thirtyDayWindow.since).toBe("2026-06-25T06:00:00.000Z");
    expect(thirtyDayWindow.badgeSince).toBe("2026-07-18T06:00:00.000Z");
  });

  it("matches nothing before the data has arrived", () => {
    const window = createRecentWindow(null, 7);

    expect(window.since).toBe(MATCHES_NOTHING);
    expect(window.badgeSince).toBe(MATCHES_NOTHING);
  });
});

describe("selectSites with an area", () => {
  const scope = createAreaScope(area, sevenDayWindow);
  const selection = selectSites(allSites, scope, null);

  it("keeps only sites inside the area", () => {
    expect(ids(selection.all)).not.toContain("far");
  });

  it("annotates distance and orders newest first, then nearest", () => {
    expect(ids(selection.all)).toEqual(["near", "mid", "older", "ancient"]);
    expect(selection.all[0]!.distanceMeters).toBeLessThan(
      selection.all[1]!.distanceMeters!,
    );
  });

  it("marks only the sites first seen inside the window", () => {
    expect(ids(selection.recent)).toEqual(["near", "mid"]);
    expect(selection.all.map((entry) => entry.recency)).toEqual([
      "new",
      "new",
      null,
      null,
    ]);
  });

  it("widens with the window", () => {
    expect(
      ids(selectSites(allSites, createAreaScope(area, thirtyDayWindow), null).recent),
    ).toEqual(["near", "mid", "older"]);
  });

  it("leaves the input untouched", () => {
    const constructionSites = [...allSites];
    selectSites(constructionSites, scope, null);

    expect(constructionSites.map((site) => site.id)).toEqual(
      allSites.map((site) => site.id),
    );
  });
});

describe("selectSites without an area", () => {
  const scope: SiteScope = {
    area: null,
    window: sevenDayWindow,
    filters: EMPTY_CONSTRUCTION_SITE_FILTERS,
    onlyRecent: false,
  };

  it("covers the whole region and leaves distance unset", () => {
    const selection = selectSites(allSites, scope, null);

    expect(ids(selection.all)).toContain("far");
    expect(selection.all.every((entry) => entry.distanceMeters === null)).toBe(
      true,
    );
  });

  it("narrows the visible set when the scope asks for new sites only", () => {
    const selection = selectSites(allSites, { ...scope, onlyRecent: true }, null);

    expect(selection.visible).toBe(selection.recent);
    expect(ids(selection.visible)).toEqual(["far", "mid", "near"]);
  });

  it("applies the filters to every projection", () => {
    const selection = selectSites(
      allSites,
      {
        ...scope,
        filters: { ...EMPTY_CONSTRUCTION_SITE_FILTERS, phase: "upcoming" },
      },
      null,
    );

    expect(ids(selection.all)).toEqual(["mid"]);
    expect(ids(selection.recent)).toEqual(["mid"]);
  });

  it("counts the toggle's total before the filters, so typing does not move it", () => {
    const selection = selectSites(
      allSites,
      {
        ...scope,
        filters: { ...EMPTY_CONSTRUCTION_SITE_FILTERS, phase: "upcoming" },
      },
      null,
    );

    expect(ids(selection.recent)).toEqual(["mid"]);
    expect(selection.recentTotal).toBe(3);
  });
});

describe("selectSites phase counts", () => {
  const scope: SiteScope = {
    area: null,
    window: sevenDayWindow,
    filters: EMPTY_CONSTRUCTION_SITE_FILTERS,
    onlyRecent: false,
  };

  it("lifts the phase filter, so each option shows what it would yield", () => {
    const selection = selectSites(
      allSites,
      {
        ...scope,
        filters: { ...EMPTY_CONSTRUCTION_SITE_FILTERS, phase: "upcoming" },
      },
      null,
    );

    expect(selection.phaseCounts).toEqual({
      total: 5,
      active: 4,
      upcoming: 1,
    });
  });

  it("respects the recency scope, so the tiles cannot overpromise", () => {
    const selection = selectSites(allSites, { ...scope, onlyRecent: true }, null);

    expect(selection.phaseCounts).toEqual({ total: 3, active: 2, upcoming: 1 });
  });
});

describe("selectSites unseen count", () => {
  const scope = createAreaScope(area, sevenDayWindow);

  it("counts everything in the badge window without an acknowledgement", () => {
    expect(selectSites(allSites, scope, null).unseenCount).toBe(2);
  });

  it("drops the sites the visitor has already seen", () => {
    expect(
      selectSites(allSites, scope, "2026-07-24T06:00:00.000Z").unseenCount,
    ).toBe(0);
    expect(
      selectSites(allSites, scope, "2026-07-20T00:00:00.000Z").unseenCount,
    ).toBe(2);
  });

  it("does not follow the visitor's time filter", () => {
    // Widening to 30 days pulls `older` into the list, but the badge answers a
    // different question and must stay on the default window.
    const widened = selectSites(
      allSites,
      createAreaScope(area, thirtyDayWindow),
      null,
    );

    expect(ids(widened.recent)).toContain("older");
    expect(widened.unseenCount).toBe(2);
  });
});

describe("isUnseenConstructionSite", () => {
  it("treats a first sighting at exactly the acknowledged instant as seen", () => {
    expect(
      isUnseenConstructionSite("2026-07-22T06:00:00Z", "2026-07-22T06:00:00Z"),
    ).toBe(false);
    expect(isUnseenConstructionSite("2026-07-22T06:00:00Z", null)).toBe(true);
  });
});

describe("EMPTY_SITE_SELECTION", () => {
  it("stands in for the states with no scope to select over", () => {
    expect(EMPTY_SITE_SELECTION.all).toEqual([]);
    expect(EMPTY_SITE_SELECTION.unseenCount).toBe(0);
    // Shared identity, so a render without an area does not churn.
    expect(EMPTY_SITE_SELECTION).toBe(EMPTY_SITE_SELECTION);
  });
});

/**
 * The timing buckets the surroundings screen renders. `FETCHED_AT` is
 * 25.07.2026, so "kurzfristig" here means a start between 18.07. and 01.08.
 */
describe("selectSites timing buckets", () => {
  const startsTomorrow = createConstructionSite("morgen", {
    point: [8.405, 49.007],
    startDate: "2026-07-26",
    endDate: "2026-07-26",
    phase: "upcoming",
  });
  const startsInWeeks = createConstructionSite("spaeter", {
    point: [8.405, 49.007],
    startDate: "2026-10-01",
    endDate: "2026-11-01",
    phase: "upcoming",
  });
  const longRunning = createConstructionSite("laeuft", {
    point: [8.405, 49.007],
    startDate: "2026-02-01",
    endDate: "2026-12-01",
  });
  const alreadyOver = createConstructionSite("vorbei", {
    point: [8.405, 49.007],
    startDate: "2026-06-01",
    endDate: "2026-07-20",
  });
  /** Sorts last by id, second by date: only a date sort puts it in the middle. */
  const startsInTwoDays = createConstructionSite("zuletzt", {
    point: [8.405, 49.007],
    startDate: "2026-07-27",
    endDate: "2026-08-10",
    phase: "upcoming",
  });
  const sites = [
    startsInWeeks,
    longRunning,
    alreadyOver,
    startsTomorrow,
    startsInTwoDays,
  ];

  const selection = selectSites(
    sites,
    createAreaScope(area, sevenDayWindow),
    null,
  );

  it("puts only what happens this week under short notice, soonest first", () => {
    expect(ids(selection.shortNotice)).toEqual(["morgen", "zuletzt"]);
  });

  it("separates what is being built from what is announced", () => {
    expect(ids(selection.running)).toEqual(["laeuft"]);
    // Soonest start first, whatever order the records arrived in.
    expect(ids(selection.planned)).toEqual(["morgen", "zuletzt", "spaeter"]);
  });

  it("keeps a site whose end date has passed out of both", () => {
    expect(ids(selection.running)).not.toContain("vorbei");
    expect(ids(selection.planned)).not.toContain("vorbei");
    // Still counted and still findable — omitted only from the actionable views.
    expect(ids(selection.all)).toContain("vorbei");
  });

  it("carries the day it measured against, so lists cannot disagree", () => {
    expect(selection.today).toBe("2026-07-25");
  });
});
