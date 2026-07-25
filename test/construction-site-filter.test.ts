import { describe, expect, it } from "vitest";
import type {
  ConstructionCategory,
  ConstructionPhase,
  ConstructionSite,
  ClosureSeverity,
} from "../src/types/index.ts";
import {
  EMPTY_CONSTRUCTION_SITE_FILTERS,
  filterConstructionSites,
  getMunicipalityOptions,
  hasNoConstructionSiteFilters,
  type ConstructionSiteFilters,
} from "../src/lib/construction-site-filter.ts";

function createConstructionSite(overrides: Partial<ConstructionSite> = {}): ConstructionSite {
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

const createFilters = (
  overrides: Partial<ConstructionSiteFilters> = {},
): ConstructionSiteFilters => ({
  ...EMPTY_CONSTRUCTION_SITE_FILTERS,
  ...overrides,
});

const getSiteIds = (constructionSites: ConstructionSite[]): string[] =>
  constructionSites.map((site) => site.id);

describe("filterConstructionSites", () => {
  const constructionSites: ConstructionSite[] = [
    createConstructionSite({
      id: "A",
      municipality: "Karlsruhe",
      phase: "active",
      closure: "full",
    }),
    createConstructionSite({
      id: "B",
      municipality: "Ettlingen",
      phase: "upcoming",
      closure: "none",
    }),
    createConstructionSite({
      id: "C",
      municipality: "Karlsruhe",
      phase: "active",
      category: "sewer" as ConstructionCategory,
      location: "Kaiserstraße",
    }),
  ];

  it("returns everything when no filter is set", () => {
    expect(
      filterConstructionSites(constructionSites, EMPTY_CONSTRUCTION_SITE_FILTERS),
    ).toHaveLength(3);
  });

  it("filters by municipality", () => {
    expect(getSiteIds(filterConstructionSites(constructionSites, createFilters({ municipality: "Ettlingen" })))).toEqual([
      "B",
    ]);
  });

  it("filters by phase", () => {
    expect(getSiteIds(filterConstructionSites(constructionSites, createFilters({ phase: "active" as ConstructionPhase })))).toEqual([
      "A",
      "C",
    ]);
  });

  it("filters by closure severity", () => {
    expect(
      getSiteIds(filterConstructionSites(constructionSites, createFilters({ closure: "full" as ClosureSeverity }))),
    ).toEqual(["A"]);
  });

  it("filters by free-text search on location, case-insensitively", () => {
    expect(getSiteIds(filterConstructionSites(constructionSites, createFilters({ search: "kaiser" })))).toEqual(["C"]);
  });

  it("combines filters with AND semantics", () => {
    const result = filterConstructionSites(
      constructionSites,
      createFilters({ municipality: "Karlsruhe", phase: "active" as ConstructionPhase, search: "kaiser" }),
    );
    expect(getSiteIds(result)).toEqual(["C"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...constructionSites];
    filterConstructionSites(constructionSites, createFilters({ municipality: "Ettlingen" }));
    expect(constructionSites).toEqual(copy);
  });
});

describe("hasNoConstructionSiteFilters", () => {
  it("treats whitespace-only search as empty", () => {
    expect(hasNoConstructionSiteFilters(createFilters({ search: "   " }))).toBe(true);
    expect(hasNoConstructionSiteFilters(createFilters({ search: "x" }))).toBe(false);
  });
});

describe("getMunicipalityOptions", () => {
  it("returns unique municipalities sorted for a German locale", () => {
    const constructionSites = [
      createConstructionSite({ municipality: "Ettlingen" }),
      createConstructionSite({ municipality: "Karlsruhe" }),
      createConstructionSite({ municipality: "Ettlingen" }),
    ];
    expect(getMunicipalityOptions(constructionSites)).toEqual(["Ettlingen", "Karlsruhe"]);
  });
});
