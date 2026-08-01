import { describe, expect, it } from "vitest";
import type { ConstructionSite } from "../src/types/index.ts";
import {
  getChangedConstructionSiteIds,
  computeConstructionSiteChanges,
} from "../src/lib/construction-site-changes.ts";

function createConstructionSite(id: string, lastModified: string): ConstructionSite {
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
    source: "Stadt Karlsruhe",
    lastModified,
  };
}

describe("computeConstructionSiteChanges", () => {
  it("detects added, modified (by lastModified) and removed records", () => {
    const previous = [createConstructionSite("A", "2026-01-01T00:00:00Z"), createConstructionSite("B", "2026-01-01T00:00:00Z")];
    const current = [
      createConstructionSite("A", "2026-01-01T00:00:00Z"), // unchanged
      createConstructionSite("B", "2026-02-01T00:00:00Z"), // stand changed -> modified
      createConstructionSite("C", "2026-02-01T00:00:00Z"), // new -> added
    ];

    expect(
      computeConstructionSiteChanges(
        previous,
        current,
        "2026-01-10T00:00:00Z",
      ),
    ).toEqual({
      since: "2026-01-10T00:00:00Z",
      added: ["C"],
      modified: ["B"],
      removed: [],
      // "B" only bumped its `stand`; no field a visitor cares about moved.
      relevantModifications: [],
    });
  });

  it("records what changed, so a notification can tell a typo fix from a closure", () => {
    const previous = [
      {
        ...createConstructionSite("A", "2026-01-01T00:00:00Z"),
        closure: "obstruction" as const,
        endDate: "2026-02-01",
      },
      createConstructionSite("B", "2026-01-01T00:00:00Z"),
    ];
    const current = [
      {
        ...createConstructionSite("A", "2026-02-01T00:00:00Z"),
        closure: "full" as const,
        endDate: "2026-04-01",
      },
      // Same dates and closure, later `stand`: a correction elsewhere.
      { ...createConstructionSite("B", "2026-02-01T00:00:00Z"), location: "Fixed" },
    ];

    const changes = computeConstructionSiteChanges(previous, current, "x");

    expect(changes.modified).toEqual(["A", "B"]);
    expect(changes.relevantModifications).toEqual([
      {
        id: "A",
        changedFields: ["period", "closure"],
        previousClosure: "obstruction",
        previousStartDate: "2026-01-01",
        previousEndDate: "2026-02-01",
      },
    ]);
  });

  it("reports every record as added on the first run", () => {
    const current = [createConstructionSite("B", "x"), createConstructionSite("A", "x")];
    const changes = computeConstructionSiteChanges([], current, null);
    expect(changes.since).toBeNull();
    expect(changes.added).toEqual(["A", "B"]); // sorted
    expect(changes.modified).toEqual([]);
    expect(changes.removed).toEqual([]);
  });

  it("detects removals", () => {
    const changes = computeConstructionSiteChanges(
      [createConstructionSite("A", "x")],
      [],
      "2026-01-10T00:00:00Z",
    );
    expect(changes.removed).toEqual(["A"]);
    expect(changes.added).toEqual([]);
  });

  it("returns displayable added and modified IDs after a comparison", () => {
    expect(
      getChangedConstructionSiteIds({
        since: "2026-01-10T00:00:00Z",
        added: ["A"],
        modified: ["B"],
        removed: ["C"],
        relevantModifications: [],
      }),
    ).toEqual(new Set(["A", "B"]));
  });

  it("does not label the initial dataset as entirely new", () => {
    expect(
      getChangedConstructionSiteIds({
        since: null,
        added: ["A", "B"],
        modified: [],
        removed: [],
        relevantModifications: [],
      }),
    ).toEqual(new Set());
  });
});
