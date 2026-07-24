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
export const isEmptyFilters = (filters: Filters): boolean =>
  filters.search.trim() === "" &&
  filters.municipality === "" &&
  filters.phase === "" &&
  filters.category === "" &&
  filters.closure === "";

/** Returns the records matching every active filter. Pure; input untouched. */
export function applyFilters(
  records: readonly Baustelle[],
  filters: Readonly<Filters>,
): Baustelle[] {
  const query = filters.search.trim().toLocaleLowerCase("de");
  return records.filter((record) => {
    if (filters.municipality && record.municipality !== filters.municipality) {
      return false;
    }
    if (filters.phase && record.phase !== filters.phase) return false;
    if (filters.category && record.category !== filters.category) return false;
    if (filters.closure && record.closure !== filters.closure) return false;
    if (query) {
      const haystack =
        `${record.municipality} ${record.location} ${record.notes ?? ""} ${record.cause ?? ""}`.toLocaleLowerCase(
          "de",
        );
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** Distinct municipalities present in the data, sorted for a German locale. */
export const distinctMunicipalities = (records: readonly Baustelle[]): string[] =>
  [...new Set(records.map((record) => record.municipality))].sort(
    (left, right) => left.localeCompare(right, "de"),
  );

/** Distinct categories present in the data (unsorted; caller sorts by label). */
export const distinctCategories = (records: readonly Baustelle[]): Category[] =>
  [...new Set(records.map((record) => record.category))];
