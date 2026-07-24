import type {
  Baustelle,
  Category,
  ClosureSeverity,
  Phase,
} from "../types/index.ts";

/**
 * Filter state for the table. Empty string on any field means "no filter on
 * this field" (i.e. show all). `search` is a free-text query matched against
 * the municipality, location, notes and cause.
 */
export interface Filters {
  search: string;
  municipality: string;
  phase: Phase | "";
  category: Category | "";
  closure: ClosureSeverity | "";
}

export const EMPTY_FILTERS: Readonly<Filters> = {
  search: "",
  municipality: "",
  phase: "",
  category: "",
  closure: "",
};

/** True when no filter is active (used to hide the "reset" affordance). */
export const isEmptyFilters = (f: Filters): boolean =>
  f.search.trim() === "" &&
  f.municipality === "" &&
  f.phase === "" &&
  f.category === "" &&
  f.closure === "";

/** Returns the records matching every active filter. Pure; input untouched. */
export function applyFilters(
  records: readonly Baustelle[],
  filters: Readonly<Filters>,
): Baustelle[] {
  const query = filters.search.trim().toLocaleLowerCase("de");
  return records.filter((r) => {
    if (filters.municipality && r.municipality !== filters.municipality) {
      return false;
    }
    if (filters.phase && r.phase !== filters.phase) return false;
    if (filters.category && r.category !== filters.category) return false;
    if (filters.closure && r.closure !== filters.closure) return false;
    if (query) {
      const haystack =
        `${r.municipality} ${r.location} ${r.notes ?? ""} ${r.cause ?? ""}`.toLocaleLowerCase(
          "de",
        );
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** Distinct municipalities present in the data, sorted for a German locale. */
export const distinctMunicipalities = (records: readonly Baustelle[]): string[] =>
  [...new Set(records.map((r) => r.municipality))].sort((a, b) =>
    a.localeCompare(b, "de"),
  );

/** Distinct categories present in the data (unsorted; caller sorts by label). */
export const distinctCategories = (records: readonly Baustelle[]): Category[] =>
  [...new Set(records.map((r) => r.category))];
