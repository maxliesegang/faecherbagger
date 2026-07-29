import { describe, expect, it } from "vitest";
import {
  getConstructionSiteRecency,
  isRecentConstructionSite,
  recentWindowSince,
  selectRecentConstructionSites,
} from "../src/shared/recency.ts";
import {
  createConstructionSite,
  editedYesterday,
  FETCHED_AT,
  LONG_AGO,
  newToday,
  recencyFixtures as allSites,
  untouched,
} from "./fixtures.ts";

const sevenDays = recentWindowSince(FETCHED_AT, 7);

describe("recentWindowSince", () => {
  it("measures back from the data timestamp, not the wall clock", () => {
    expect(recentWindowSince(FETCHED_AT, 7)).toBe("2026-07-18T06:00:00.000Z");
    expect(recentWindowSince(FETCHED_AT, 1)).toBe("2026-07-24T06:00:00.000Z");
  });
});

describe("getConstructionSiteRecency", () => {
  it("counts an addition, never an edit to a known record", () => {
    expect(getConstructionSiteRecency(newToday, sevenDays)).toBe("new");
    expect(getConstructionSiteRecency(untouched, sevenDays)).toBeNull();
  });

  it("ignores a fresh stand on a record we have had for months", () => {
    // The app has one definition of "neu": we did not have this before. An
    // edit the source makes to a record someone already knows about must not
    // resurface it — not here, not in the badge, not as a notification.
    expect(getConstructionSiteRecency(editedYesterday, sevenDays)).toBeNull();
    expect(isRecentConstructionSite(editedYesterday, sevenDays)).toBe(false);
  });

  it("calls a record new even when its stand is older than its first sighting", () => {
    // A record the source published with a backdated `stand`, which we saw for
    // the first time today: new to this visitor, whatever the source says.
    const backdated = createConstructionSite("backdated", {
      lastModified: "2026-06-01T00:00:00.000Z",
      firstSeenAt: "2026-07-25T05:00:00.000Z",
    });

    expect(getConstructionSiteRecency(backdated, sevenDays)).toBe("new");
    expect(isRecentConstructionSite(backdated, sevenDays)).toBe(true);
  });

  it("treats a first sighting exactly at the boundary as inside", () => {
    const boundary = createConstructionSite("boundary", {
      lastModified: LONG_AGO,
      firstSeenAt: sevenDays,
    });

    expect(getConstructionSiteRecency(boundary, sevenDays)).toBe("new");
  });
});

describe("selectRecentConstructionSites", () => {
  it("keeps additions inside the window, most recently sighted first", () => {
    expect(
      selectRecentConstructionSites(allSites, sevenDays).map((site) => site.id),
    ).toEqual(["new-today", "new-last-week"]);
  });

  it("orders records introduced by the same run by stand, then by id", () => {
    // Every record from one pipeline run shares a `firstSeenAt`, so the
    // tiebreak is the normal case rather than the exception.
    const sameRun = "2026-07-24T12:00:00.000Z";
    const sites = [
      createConstructionSite("b", {
        lastModified: "2026-07-24T08:00:00.000Z",
        firstSeenAt: sameRun,
      }),
      createConstructionSite("a", {
        lastModified: "2026-07-24T08:00:00.000Z",
        firstSeenAt: sameRun,
      }),
      createConstructionSite("c", {
        lastModified: "2026-07-24T11:00:00.000Z",
        firstSeenAt: sameRun,
      }),
    ];

    expect(
      selectRecentConstructionSites(sites, sevenDays).map((site) => site.id),
    ).toEqual(["c", "a", "b"]);
  });

  it("narrows with the window", () => {
    // A 24 h window ends at 2026-07-24T06:00Z, so last week's addition drops.
    expect(
      selectRecentConstructionSites(
        allSites,
        recentWindowSince(FETCHED_AT, 1),
      ).map((site) => site.id),
    ).toEqual(["new-today"]);
  });

  it("leaves the input untouched", () => {
    const constructionSites = [...allSites];
    selectRecentConstructionSites(constructionSites, sevenDays);

    expect(constructionSites).toEqual(allSites);
  });
});
