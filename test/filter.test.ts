import { describe, expect, it } from "vitest";
import type { Baustelle, Category, ClosureSeverity, Phase } from "../src/types/index.ts";
import {
  applyFilters,
  distinctMunicipalities,
  EMPTY_FILTERS,
  isEmptyFilters,
  type Filters,
} from "../src/lib/filter.ts";

function record(overrides: Partial<Baustelle> = {}): Baustelle {
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
    point: [8.4, 49.0],
    geometry: { type: "Point", coordinates: [8.4, 49.0] },
    source: "Stadt Karlsruhe",
    lastModified: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const filters = (overrides: Partial<Filters> = {}): Filters => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

const ids = (records: Baustelle[]): string[] => records.map((r) => r.id);

describe("applyFilters", () => {
  const data: Baustelle[] = [
    record({ id: "A", municipality: "Karlsruhe", phase: "active", closure: "full" }),
    record({ id: "B", municipality: "Ettlingen", phase: "upcoming", closure: "none" }),
    record({
      id: "C",
      municipality: "Karlsruhe",
      phase: "active",
      category: "sewer" as Category,
      location: "Kaiserstraße",
    }),
  ];

  it("returns everything when no filter is set", () => {
    expect(applyFilters(data, EMPTY_FILTERS)).toHaveLength(3);
  });

  it("filters by municipality", () => {
    expect(ids(applyFilters(data, filters({ municipality: "Ettlingen" })))).toEqual([
      "B",
    ]);
  });

  it("filters by phase", () => {
    expect(ids(applyFilters(data, filters({ phase: "active" as Phase })))).toEqual([
      "A",
      "C",
    ]);
  });

  it("filters by closure severity", () => {
    expect(
      ids(applyFilters(data, filters({ closure: "full" as ClosureSeverity }))),
    ).toEqual(["A"]);
  });

  it("filters by free-text search on location, case-insensitively", () => {
    expect(ids(applyFilters(data, filters({ search: "kaiser" })))).toEqual(["C"]);
  });

  it("combines filters with AND semantics", () => {
    const result = applyFilters(
      data,
      filters({ municipality: "Karlsruhe", phase: "active" as Phase, search: "kaiser" }),
    );
    expect(ids(result)).toEqual(["C"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...data];
    applyFilters(data, filters({ municipality: "Ettlingen" }));
    expect(data).toEqual(copy);
  });
});

describe("isEmptyFilters", () => {
  it("treats whitespace-only search as empty", () => {
    expect(isEmptyFilters(filters({ search: "   " }))).toBe(true);
    expect(isEmptyFilters(filters({ search: "x" }))).toBe(false);
  });
});

describe("distinctMunicipalities", () => {
  it("returns unique municipalities sorted for a German locale", () => {
    const data = [
      record({ municipality: "Ettlingen" }),
      record({ municipality: "Karlsruhe" }),
      record({ municipality: "Ettlingen" }),
    ];
    expect(distinctMunicipalities(data)).toEqual(["Ettlingen", "Karlsruhe"]);
  });
});
