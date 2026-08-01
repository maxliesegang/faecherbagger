import { describe, expect, it } from "vitest";
import type { ConstructionSite } from "../src/types/index.ts";
import {
  CONSTRUCTION_SITE_SORT_PRESETS,
  serializeConstructionSiteSort,
  parseConstructionSiteSort,
  sortConstructionSitesBy,
  sortConstructionSitesByDefaultOrder,
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
    source: "Stadt Karlsruhe",
    lastModified: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("sortConstructionSitesByDefaultOrder", () => {
  it("orders by phase, closure severity, start date and id", () => {
    const input = [
      createConstructionSite({ id: "upcoming", phase: "upcoming", closure: "full" }),
      createConstructionSite({ id: "later", closure: "full", startDate: "2026-02-01" }),
      createConstructionSite({ id: "B", closure: "full" }),
      createConstructionSite({ id: "none", closure: "none" }),
      createConstructionSite({ id: "A", closure: "full" }),
    ];

    expect(
      sortConstructionSitesByDefaultOrder(input).map(({ id }) => id),
    ).toEqual([
      "later",
      "A",
      "B",
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

  it("puts the most recently started active sites first", () => {
    const input = [
      createConstructionSite({ id: "old", closure: "full", startDate: "2023-01-09" }),
      createConstructionSite({ id: "fresh", closure: "full", startDate: "2026-07-20" }),
      createConstructionSite({ id: "middle", closure: "full", startDate: "2025-03-04" }),
    ];

    expect(
      sortConstructionSitesByDefaultOrder(input).map(({ id }) => id),
    ).toEqual(["fresh", "middle", "old"]);
  });

  it("puts the planned sites starting soonest first", () => {
    const input = [
      createConstructionSite({
        id: "far",
        phase: "upcoming",
        closure: "full",
        startDate: "2027-05-01",
      }),
      createConstructionSite({
        id: "soon",
        phase: "upcoming",
        closure: "full",
        startDate: "2026-08-03",
      }),
    ];

    expect(
      sortConstructionSitesByDefaultOrder(input).map(({ id }) => id),
    ).toEqual(["soon", "far"]);
  });

  it("keeps severity above the start date in both phases", () => {
    const input = [
      createConstructionSite({ id: "fresh-mild", closure: "none", startDate: "2026-07-20" }),
      createConstructionSite({ id: "old-severe", closure: "full", startDate: "2023-01-09" }),
    ];

    expect(
      sortConstructionSitesByDefaultOrder(input).map(({ id }) => id),
    ).toEqual(["old-severe", "fresh-mild"]);
  });
});

describe("sortConstructionSitesBy", () => {
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
    const sorted = sortConstructionSitesBy(
      [later, earlier],
      { key, direction: "ascending" },
      [8.4, 49],
    );
    expect(sorted.map(({ id }) => id)).toEqual(expected);
  });

  it("reverses the selected column when descending", () => {
    const sorted = sortConstructionSitesBy(
      [earlier, later],
      { key: "municipality", direction: "descending" },
    );
    expect(sorted.map(({ id }) => id)).toEqual(["later", "earlier"]);
  });

  it("does not mutate the input", () => {
    const input = [later, earlier];
    sortConstructionSitesBy(input, {
      key: "location",
      direction: "ascending",
    });
    expect(input).toEqual([later, earlier]);
  });
});

describe("sort tokens", () => {
  it("round-trips every preset offered by the sort control", () => {
    for (const preset of CONSTRUCTION_SITE_SORT_PRESETS) {
      expect(
        parseConstructionSiteSort(serializeConstructionSiteSort(preset.sort)),
      ).toEqual(preset.sort);
    }
  });

  it("represents the display order as an empty token", () => {
    expect(serializeConstructionSiteSort(null)).toBe("");
  });

  it("rejects unknown keys, directions and malformed tokens", () => {
    expect(parseConstructionSiteSort("lage:ascending")).toBeNull();
    expect(parseConstructionSiteSort("period:seitwaerts")).toBeNull();
    expect(parseConstructionSiteSort("period")).toBeNull();
    expect(parseConstructionSiteSort(null)).toBeNull();
  });

  it("offers exactly one location-dependent preset", () => {
    expect(
      CONSTRUCTION_SITE_SORT_PRESETS.filter((preset) => preset.needsLocation),
    ).toEqual([
      {
        sort: { key: "distance", direction: "ascending" },
        label: "Entfernung (nächste zuerst)",
        needsLocation: true,
      },
    ]);
  });

  it("offers the display order as the first preset", () => {
    expect(CONSTRUCTION_SITE_SORT_PRESETS[0].sort).toBeNull();
  });
});
