import type {
  ConstructionCategory,
  ConstructionPhase,
  ConstructionSite,
  ClosureSeverity,
} from "../types/index.ts";

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
}

export const EMPTY_CONSTRUCTION_SITE_FILTERS: Readonly<ConstructionSiteFilters> = {
  search: "",
  municipality: "",
  phase: "",
  category: "",
  closure: "",
};

/** True when no filter is active (used to hide the "reset" affordance). */
export const hasNoConstructionSiteFilters = (
  filters: ConstructionSiteFilters,
): boolean =>
  filters.search.trim() === "" &&
  filters.municipality === "" &&
  filters.phase === "" &&
  filters.category === "" &&
  filters.closure === "";

/** Returns the records matching every active filter. Pure; input untouched. */
export function filterConstructionSites(
  constructionSites: readonly ConstructionSite[],
  filters: Readonly<ConstructionSiteFilters>,
): ConstructionSite[] {
  const query = filters.search.trim().toLocaleLowerCase("de");
  return constructionSites.filter((site) => {
    if (filters.municipality && site.municipality !== filters.municipality) {
      return false;
    }
    if (filters.phase && site.phase !== filters.phase) return false;
    if (filters.category && site.category !== filters.category) return false;
    if (filters.closure && site.closure !== filters.closure) return false;
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

/** Distinct municipalities present in the data, sorted for a German locale. */
export const getMunicipalityOptions = (
  constructionSites: readonly ConstructionSite[],
): string[] =>
  [...new Set(constructionSites.map((site) => site.municipality))].sort(
    (left, right) => left.localeCompare(right, "de"),
  );

/** Distinct categories present in the data (unsorted; caller sorts by label). */
export const getCategoryOptions = (
  constructionSites: readonly ConstructionSite[],
): ConstructionCategory[] =>
  [...new Set(constructionSites.map((site) => site.category))];
