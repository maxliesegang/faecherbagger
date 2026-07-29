import { describe, expect, it } from "vitest";
import type {
  ConstructionSite,
  ConstructionSiteChanges,
} from "../src/types/index.ts";
import {
  getChangedConstructionSiteIds,
  computeConstructionSiteChanges,
  indexConstructionSiteChanges,
} from "../src/lib/construction-site-changes.ts";

function createConstructionSite(
  id: string,
  lastModified: string,
): ConstructionSite {
  return {
    id,
    phase: "active",
    category: "other",
    artRaw: "",
    closure: "unknown",
    siteType: null,
    municipality: "Karlsruhe",
    location: "",
    notes: null,
    cause: null,
    startDate: "2026-01-01",
    endDate: null,
    point: [8.4, 49.0],
    geometry: { type: "Point", coordinates: [8.4, 49.0] },
    source: "Stadt Karlsruhe",
    lastModified,
  };
}

const FETCHED_AT = "2026-07-20T12:00:00Z";

describe("computeConstructionSiteChanges", () => {
  it("detects added, modified (by lastModified) and removed records", () => {
    const previous = [
      createConstructionSite("A", "2026-01-01T00:00:00Z"),
      createConstructionSite("B", "2026-01-01T00:00:00Z"),
    ];
    const current = [
      createConstructionSite("A", "2026-01-01T00:00:00Z"), // unchanged
      createConstructionSite("B", "2026-02-01T00:00:00Z"), // stand changed -> modified
      createConstructionSite("C", "2026-02-01T00:00:00Z"), // new -> added
    ];

    expect(
      computeConstructionSiteChanges(previous, current, null, FETCHED_AT),
    ).toEqual({
      since: "2026-07-13T12:00:00.000Z",
      added: [{ id: "C", detectedAt: FETCHED_AT }],
      modified: [{ id: "B", detectedAt: FETCHED_AT }],
      removed: [],
    });
  });

  it("reports every record as added on the first run", () => {
    const current = [
      createConstructionSite("B", "x"),
      createConstructionSite("A", "x"),
    ];
    const changes = computeConstructionSiteChanges([], current, null, FETCHED_AT);
    expect(changes.since).toBeNull();
    expect(changes.added).toEqual([
      { id: "A", detectedAt: FETCHED_AT },
      { id: "B", detectedAt: FETCHED_AT },
    ]);
    expect(changes.modified).toEqual([]);
    expect(changes.removed).toEqual([]);
  });

  it("detects removals", () => {
    const changes = computeConstructionSiteChanges(
      [createConstructionSite("A", "x")],
      [],
      null,
      FETCHED_AT,
    );
    expect(changes.removed).toEqual(["A"]);
    expect(changes.added).toEqual([]);
  });

  it("carries forward added entries within the 7-day window", () => {
    const previousSites = [createConstructionSite("A", "2026-01-01T00:00:00Z")];
    const currentSites = [createConstructionSite("A", "2026-01-01T00:00:00Z")];

    const threeDaysAgo = new Date(
      new Date(FETCHED_AT).getTime() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const previousChanges: ConstructionSiteChanges = {
      since: "2026-07-10T00:00:00Z",
      added: [{ id: "A", detectedAt: threeDaysAgo }],
      modified: [],
      removed: [],
    };

    const changes = computeConstructionSiteChanges(
      previousSites,
      currentSites,
      previousChanges,
      FETCHED_AT,
    );

    expect(changes.added).toEqual([{ id: "A", detectedAt: threeDaysAgo }]);
    expect(changes.modified).toEqual([]);
    expect(changes.since).not.toBeNull();
  });

  it("drops carried-forward entries older than 7 days", () => {
    const previousSites = [createConstructionSite("A", "2026-01-01T00:00:00Z")];
    const currentSites = [createConstructionSite("A", "2026-01-01T00:00:00Z")];

    const tenDaysAgo = new Date(
      new Date(FETCHED_AT).getTime() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const previousChanges: ConstructionSiteChanges = {
      since: "2026-07-10T00:00:00Z",
      added: [{ id: "A", detectedAt: tenDaysAgo }],
      modified: [],
      removed: [],
    };

    const changes = computeConstructionSiteChanges(
      previousSites,
      currentSites,
      previousChanges,
      FETCHED_AT,
    );

    expect(changes.added).toEqual([]);
    expect(changes.modified).toEqual([]);
  });

  it("ignores previous changes entries in legacy string format", () => {
    const previousSites = [createConstructionSite("A", "2026-01-01T00:00:00Z")];
    const currentSites = [createConstructionSite("A", "2026-01-01T00:00:00Z")];

    const previousChanges = {
      since: "2026-07-10T00:00:00Z",
      added: ["A", "B"],
      modified: ["C"],
      removed: [],
    } as unknown as ConstructionSiteChanges;

    const changes = computeConstructionSiteChanges(
      previousSites,
      currentSites,
      previousChanges,
      FETCHED_AT,
    );

    expect(changes.added).toEqual([]);
    expect(changes.modified).toEqual([]);
  });

  it("preserves 'added' status when a previously added site gets modified", () => {
    const twoDaysAgo = new Date(
      new Date(FETCHED_AT).getTime() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const previousSites = [createConstructionSite("A", "2026-01-01T00:00:00Z")];
    const currentSites = [createConstructionSite("A", "2026-02-01T00:00:00Z")];

    const previousChanges: ConstructionSiteChanges = {
      since: "2026-07-10T00:00:00Z",
      added: [{ id: "A", detectedAt: twoDaysAgo }],
      modified: [],
      removed: [],
    };

    const changes = computeConstructionSiteChanges(
      previousSites,
      currentSites,
      previousChanges,
      FETCHED_AT,
    );

    expect(changes.added).toEqual([{ id: "A", detectedAt: twoDaysAgo }]);
    expect(changes.modified).toEqual([]);
  });

  it("carries forward modified entries for unchanged sites within the window", () => {
    const fourDaysAgo = new Date(
      new Date(FETCHED_AT).getTime() - 4 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const previousSites = [
      createConstructionSite("A", "2026-01-01T00:00:00Z"),
      createConstructionSite("B", "2026-02-01T00:00:00Z"),
    ];
    const currentSites = [
      createConstructionSite("A", "2026-01-01T00:00:00Z"), // unchanged
      createConstructionSite("B", "2026-02-01T00:00:00Z"), // unchanged, was modified
    ];

    const previousChanges: ConstructionSiteChanges = {
      since: "2026-07-10T00:00:00Z",
      added: [
        { id: "A", detectedAt: fourDaysAgo }, // still new
      ],
      modified: [
        { id: "B", detectedAt: fourDaysAgo }, // modified 4 days ago, unchanged now
      ],
      removed: [],
    };

    const changes = computeConstructionSiteChanges(
      previousSites,
      currentSites,
      previousChanges,
      FETCHED_AT,
    );

    expect(changes.added).toEqual([{ id: "A", detectedAt: fourDaysAgo }]);
    expect(changes.modified).toEqual([{ id: "B", detectedAt: fourDaysAgo }]);
  });
});

describe("getChangedConstructionSiteIds", () => {
  it("returns displayable added and modified IDs after a comparison", () => {
    expect(
      getChangedConstructionSiteIds({
        since: "2026-07-13T12:00:00Z",
        added: [{ id: "A", detectedAt: "2026-07-19T00:00:00Z" }],
        modified: [{ id: "B", detectedAt: "2026-07-18T00:00:00Z" }],
        removed: ["C"],
      }),
    ).toEqual(new Set(["A", "B"]));
  });

  it("does not label the initial dataset as entirely new", () => {
    expect(
      getChangedConstructionSiteIds({
        since: null,
        added: [{ id: "A", detectedAt: "2026-07-19T00:00:00Z" }],
        modified: [],
        removed: [],
      }),
    ).toEqual(new Set());
  });
});

describe("indexConstructionSiteChanges", () => {
  it("keys added and modified entries by construction-site id", () => {
    const index = indexConstructionSiteChanges({
      since: "2026-07-13T12:00:00Z",
      added: [{ id: "A", detectedAt: "2026-07-19T00:00:00Z" }],
      modified: [{ id: "B", detectedAt: "2026-07-18T00:00:00Z" }],
      removed: ["C"],
    });

    expect(index.get("A")).toEqual({
      status: "added",
      detectedAt: "2026-07-19T00:00:00Z",
    });
    expect(index.get("B")).toEqual({
      status: "modified",
      detectedAt: "2026-07-18T00:00:00Z",
    });
    expect(index.has("C")).toBe(false);
  });

  it("prefers 'added' when an id appears in both lists", () => {
    const index = indexConstructionSiteChanges({
      since: "2026-07-13T12:00:00Z",
      added: [{ id: "A", detectedAt: "2026-07-19T00:00:00Z" }],
      modified: [{ id: "A", detectedAt: "2026-07-18T00:00:00Z" }],
      removed: [],
    });

    expect(index.get("A")?.status).toBe("added");
  });

  it("stays empty for a first run without a comparison base", () => {
    expect(
      indexConstructionSiteChanges({
        since: null,
        added: [{ id: "A", detectedAt: "2026-07-19T00:00:00Z" }],
        modified: [],
        removed: [],
      }).size,
    ).toBe(0);
  });
});
