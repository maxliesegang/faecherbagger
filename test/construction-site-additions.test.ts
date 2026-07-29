import { describe, expect, it } from "vitest";
import {
  buildConstructionSiteAdditions,
  selectConstructionSitesToNotify,
} from "../src/pipeline/construction-site-additions.ts";
import { FETCHED_AT, recencyFixtures as allSites } from "./fixtures.ts";

describe("buildConstructionSiteAdditions", () => {
  it("publishes the window with both timestamps per entry", () => {
    expect(buildConstructionSiteAdditions(allSites, FETCHED_AT)).toEqual({
      fetchedAt: FETCHED_AT,
      windowDays: 7,
      since: "2026-07-18T06:00:00.000Z",
      added: [
        {
          id: "new-today",
          lastModified: "2026-07-25T05:00:00.000Z",
          firstSeenAt: "2026-07-25T05:00:00.000Z",
        },
        {
          id: "new-last-week",
          lastModified: "2026-07-20T09:00:00.000Z",
          firstSeenAt: "2026-07-20T06:00:00.000Z",
        },
      ],
    });
  });

  it("leaves out a record the source merely edited", () => {
    expect(
      buildConstructionSiteAdditions(allSites, FETCHED_AT).added.map(
        (entry) => entry.id,
      ),
    ).not.toContain("edited-yesterday");
  });
});

describe("selectConstructionSitesToNotify", () => {
  const additions = buildConstructionSiteAdditions(allSites, FETCHED_AT);

  it("notifies about additions since the last completed broadcast", () => {
    expect(
      selectConstructionSitesToNotify(additions, "2026-07-24T18:00:00.000Z").map(
        (entry) => entry.id,
      ),
    ).toEqual(["new-today"]);
  });

  it("does not re-notify when the last broadcast already covered the run", () => {
    expect(selectConstructionSitesToNotify(additions, FETCHED_AT)).toEqual([]);
  });

  it("catches up on a broadcast that never completed", () => {
    // The cutoff is the last *completed* broadcast, so a failed fan-out five
    // days ago is picked up here rather than being skipped forever.
    expect(
      selectConstructionSitesToNotify(additions, "2026-07-19T18:00:00.000Z").map(
        (entry) => entry.id,
      ),
    ).toEqual(["new-today", "new-last-week"]);
  });

  it("stays silent with no delivery history, rather than announcing the backlog", () => {
    expect(additions.added.length).toBeGreaterThan(0);
    expect(selectConstructionSitesToNotify(additions, null)).toEqual([]);
  });
});
