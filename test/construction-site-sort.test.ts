import { describe, expect, it } from "vitest";
import type { ConstructionSite } from "../src/types/index.ts";
import {
  sortConstructionSites,
  sortConstructionSitesForDisplay,
  type ConstructionSiteSortKey,
} from "../src/lib/construction-site-sort.ts";

function createConstructionSite(overrides: Partial<ConstructionSite>): ConstructionSite {
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
    startDate: "2026-01-01",
    endDate: null,
    point: [8.4, 49],
    geometry: { type: "Point", coordinates: [8.4, 49] },
    source: "Stadt Karlsruhe",
    lastModified: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("sortConstructionSitesForDisplay", () => {
  it("orders by phase, closure severity, start date and id", () => {
    const input = [
      createConstructionSite({ id: "upcoming", phase: "upcoming", closure: "full" }),
      createConstructionSite({ id: "later", closure: "full", startDate: "2026-02-01" }),
      createConstructionSite({ id: "B", closure: "full" }),
      createConstructionSite({ id: "none", closure: "none" }),
      createConstructionSite({ id: "A", closure: "full" }),
    ];

    expect(sortConstructionSitesForDisplay(input).map(({ id }) => id)).toEqual([
      "A",
      "B",
      "later",
      "none",
      "upcoming",
    ]);
    expect(input.map(({ id }) => id)).toEqual([
      "upcoming",
      "later",
      "B",
      "none",
      "A",
    ]);
  });
});

describe("sortConstructionSites", () => {
  const earlier = createConstructionSite({
    id: "earlier",
    municipality: "Baden-Baden",
    location: "Allee 2",
    category: "bridge",
    closure: "none",
    phase: "active",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    lastModified: "2026-01-01T00:00:00Z",
    point: [8.4, 49],
  });
  const later = createConstructionSite({
    id: "later",
    municipality: "Karlsruhe",
    location: "Zähringerstraße 10",
    category: "sewer",
    closure: "full",
    phase: "upcoming",
    startDate: "2026-02-01",
    endDate: null,
    lastModified: "2026-02-01T00:00:00Z",
    point: [9.4, 49],
  });

  const ascendingCases: Array<[ConstructionSiteSortKey, string[]]> = [
    ["municipality", ["earlier", "later"]],
    ["location", ["earlier", "later"]],
    ["category", ["earlier", "later"]],
    ["closure", ["earlier", "later"]],
    ["phase", ["earlier", "later"]],
    ["period", ["earlier", "later"]],
    ["lastModified", ["earlier", "later"]],
    ["distance", ["earlier", "later"]],
  ];

  it.each(ascendingCases)("sorts the %s column ascending", (key, expected) => {
    const sorted = sortConstructionSites(
      [later, earlier],
      { key, direction: "ascending" },
      [8.4, 49],
    );
    expect(sorted.map(({ id }) => id)).toEqual(expected);
  });

  it("reverses the selected column when descending", () => {
    const sorted = sortConstructionSites(
      [earlier, later],
      { key: "municipality", direction: "descending" },
    );
    expect(sorted.map(({ id }) => id)).toEqual(["later", "earlier"]);
  });

  it("does not mutate the input", () => {
    const input = [later, earlier];
    sortConstructionSites(input, { key: "location", direction: "ascending" });
    expect(input).toEqual([later, earlier]);
  });
});
