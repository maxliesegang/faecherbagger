import type {
  ConstructionCategory,
  ConstructionPhase,
  ConstructionSite,
  ClosureSeverity,
  ISODate,
} from "../types/index.ts";
import {
  getBerlinCalendarDate,
  isConstructionSiteInTimeframe,
  type ConstructionSiteTimeframe,
} from "./construction-site-timeframe.ts";

/**
 * Filter state for the table. Empty string on any field means "no filter on
 * this field" (i.e. show all). `search` is a free-text query matched against
 * the municipality, location, notes and cause.
 */
export interface ConstructionSiteFilters {
  search: string;
  municipality: string;
  phase: ConstructionPhase | "";
  category: ConstructionCategory | "";
  closure: ClosureSeverity | "";
  timeframe: ConstructionSiteTimeframe;
}

export const EMPTY_CONSTRUCTION_SITE_FILTERS: Readonly<ConstructionSiteFilters> = {
  search: "",
  municipality: "",
  phase: "",
  category: "",
  closure: "",
  timeframe: "",
};

/** True when no filter is active (used to hide the "reset" affordance). */
export const hasNoConstructionSiteFilters = (
  filters: ConstructionSiteFilters,
): boolean =>
  filters.search.trim() === "" &&
  filters.municipality === "" &&
  filters.phase === "" &&
  filters.category === "" &&
  filters.closure === "" &&
  filters.timeframe === "";

/**
 * Returns the records matching every active filter. Pure; input untouched.
 * `today` is injected so the timeframe windows stay testable and so one render
 * pass cannot straddle a midnight boundary.
 */
export function filterConstructionSites(
  constructionSites: readonly ConstructionSite[],
  filters: Readonly<ConstructionSiteFilters>,
  today: ISODate = getBerlinCalendarDate(),
): ConstructionSite[] {
  const query = filters.search.trim().toLocaleLowerCase("de");
  return constructionSites.filter((site) => {
    if (filters.municipality && site.municipality !== filters.municipality) {
      return false;
    }
    if (filters.phase && site.phase !== filters.phase) return false;
    if (filters.category && site.category !== filters.category) return false;
    if (filters.closure && site.closure !== filters.closure) return false;
    if (!isConstructionSiteInTimeframe(site, filters.timeframe, today)) {
      return false;
    }
    if (query) {
      const searchableText =
        `${site.municipality} ${site.location} ${site.notes ?? ""} ${site.cause ?? ""}`.toLocaleLowerCase(
          "de",
        );
      if (!searchableText.includes(query)) return false;
    }
    return true;
  });
}

/**
 * Counts per phase for the current query with the phase filter itself removed,
 * so the status switch can show how many records each option would yield.
 */
export function countConstructionSitesByPhase(
  constructionSites: readonly ConstructionSite[],
  filters: Readonly<ConstructionSiteFilters>,
  today: ISODate = getBerlinCalendarDate(),
): { total: number; active: number; upcoming: number } {
  const matching = filterConstructionSites(
    constructionSites,
    { ...filters, phase: "" },
    today,
  );
  const active = matching.filter((site) => site.phase === "active").length;
  return {
    total: matching.length,
    active,
    upcoming: matching.length - active,
  };
}

/** Distinct municipalities present in the data, sorted for a German locale. */
export const getConstructionSiteMunicipalityOptions = (
  constructionSites: readonly ConstructionSite[],
): string[] =>
  [...new Set(constructionSites.map((site) => site.municipality))].sort(
    (left, right) => left.localeCompare(right, "de"),
  );

/** Distinct categories present in the data (unsorted; caller sorts by label). */
export const getConstructionSiteCategoryOptions = (
  constructionSites: readonly ConstructionSite[],
): ConstructionCategory[] =>
  [...new Set(constructionSites.map((site) => site.category))];
