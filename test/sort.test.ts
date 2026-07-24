import { describe, expect, it } from "vitest";
import type { Baustelle } from "../src/types/index.ts";
import {
  sortBaustellen,
  sortBaustellenForDisplay,
  type BaustellenSortKey,
} from "../src/lib/sort.ts";

function record(overrides: Partial<Baustelle>): Baustelle {
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

describe("sortBaustellenForDisplay", () => {
  it("orders by phase, closure severity, start date and id", () => {
    const input = [
      record({ id: "upcoming", phase: "upcoming", closure: "full" }),
      record({ id: "later", closure: "full", startDate: "2026-02-01" }),
      record({ id: "B", closure: "full" }),
      record({ id: "none", closure: "none" }),
      record({ id: "A", closure: "full" }),
    ];

    expect(sortBaustellenForDisplay(input).map(({ id }) => id)).toEqual([
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

describe("sortBaustellen", () => {
  const earlier = record({
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
  const later = record({
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

  const ascendingCases: Array<[BaustellenSortKey, string[]]> = [
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
    const sorted = sortBaustellen(
      [later, earlier],
      { key, direction: "ascending" },
      [8.4, 49],
    );
    expect(sorted.map(({ id }) => id)).toEqual(expected);
  });

  it("reverses the selected column when descending", () => {
    const sorted = sortBaustellen(
      [earlier, later],
      { key: "municipality", direction: "descending" },
    );
    expect(sorted.map(({ id }) => id)).toEqual(["later", "earlier"]);
  });

  it("does not mutate the input", () => {
    const input = [later, earlier];
    sortBaustellen(input, { key: "location", direction: "ascending" });
    expect(input).toEqual([later, earlier]);
  });
});
