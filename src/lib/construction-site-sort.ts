import type { ConstructionSite, LngLat } from "../types/index.ts";
import { CLOSURE_SEVERITY_SORT_RANK } from "../types/index.ts";
import { distanceInMeters } from "./distance.ts";
import {
  getConstructionCategoryLabel,
  getConstructionPhaseLabel,
} from "./construction-site-labels.ts";

export type ConstructionSiteSortKey =
  | "municipality"
  | "location"
  | "category"
  | "closure"
  | "phase"
  | "period"
  | "lastModified"
  | "distance";

export type ConstructionSiteSortDirection = "ascending" | "descending";

export interface ConstructionSiteSort {
  key: ConstructionSiteSortKey;
  direction: ConstructionSiteSortDirection;
}

const SORT_KEYS = new Set<ConstructionSiteSortKey>([
  "municipality",
  "location",
  "category",
  "closure",
  "phase",
  "period",
  "lastModified",
  "distance",
]);

/**
 * Sort orders offered as a single control above the results. `null` is the
 * display order (see {@link compareConstructionSitesByDefaultOrder}); the table
 * header buttons can still produce combinations not listed here, which the
 * control then reports as "Eigene Sortierung".
 */
export const CONSTRUCTION_SITE_SORT_PRESETS: readonly {
  sort: ConstructionSiteSort | null;
  label: string;
  /** Only offered when the user shared a location. */
  needsLocation?: boolean;
}[] = [
  { sort: null, label: "Empfohlen" },
  {
    sort: { key: "distance", direction: "ascending" },
    label: "Entfernung (nächste zuerst)",
    needsLocation: true,
  },
  { sort: { key: "period", direction: "ascending" }, label: "Beginn (früheste zuerst)" },
  { sort: { key: "period", direction: "descending" }, label: "Beginn (späteste zuerst)" },
  { sort: { key: "closure", direction: "descending" }, label: "Verkehrsauswirkung" },
  { sort: { key: "lastModified", direction: "descending" }, label: "Zuletzt aktualisiert" },
  { sort: { key: "municipality", direction: "ascending" }, label: "Ort (A–Z)" },
  { sort: { key: "location", direction: "ascending" }, label: "Lage (A–Z)" },
];

/** Stable token for a sort, used by the select and the URL (`""` = default). */
export const serializeConstructionSiteSort = (
  sort: ConstructionSiteSort | null,
): string => (sort ? `${sort.key}:${sort.direction}` : "");

/** Inverse of {@link serializeConstructionSiteSort}; unknown tokens yield `null`. */
export function parseConstructionSiteSort(
  value: string | null | undefined,
): ConstructionSiteSort | null {
  const [key, direction] = (value ?? "").split(":");
  if (!SORT_KEYS.has(key as ConstructionSiteSortKey)) return null;
  if (direction !== "ascending" && direction !== "descending") return null;
  return { key: key as ConstructionSiteSortKey, direction };
}

const GERMAN_COLLATOR = new Intl.Collator("de", {
  numeric: true,
  sensitivity: "base",
});

function compareNullableStrings(
  left: string | null,
  right: string | null,
): number {
  if (left == null) return right == null ? 0 : 1;
  if (right == null) return -1;
  return GERMAN_COLLATOR.compare(left, right);
}

function compareByKey(
  left: ConstructionSite,
  right: ConstructionSite,
  key: ConstructionSiteSortKey,
  currentLocation?: LngLat,
): number {
  switch (key) {
    case "municipality":
      return GERMAN_COLLATOR.compare(left.municipality, right.municipality);
    case "location":
      return GERMAN_COLLATOR.compare(left.location, right.location);
    case "category":
      return GERMAN_COLLATOR.compare(
        getConstructionCategoryLabel(left.category),
        getConstructionCategoryLabel(right.category),
      );
    case "closure":
      return (
        CLOSURE_SEVERITY_SORT_RANK[left.closure] -
        CLOSURE_SEVERITY_SORT_RANK[right.closure]
      );
    case "phase":
      return GERMAN_COLLATOR.compare(
        getConstructionPhaseLabel(left.phase),
        getConstructionPhaseLabel(right.phase),
      );
    case "period": {
      const start = left.startDate.localeCompare(right.startDate);
      return start !== 0
        ? start
        : compareNullableStrings(left.endDate, right.endDate);
    }
    case "lastModified":
      return left.lastModified.localeCompare(right.lastModified);
    case "distance":
      return currentLocation
        ? distanceInMeters(currentLocation, left.point) -
            distanceInMeters(currentLocation, right.point)
        : 0;
  }
}

/**
 * Sort order for lists: current sites before planned ones, then the most
 * disruptive closures first, then the start date closest to now.
 *
 * The date tiebreaker runs in opposite directions per phase on purpose. Within
 * the active sites the most recently started ones are the news; sorting them
 * ascending instead buried the whole first screen under multi-year scaffolding
 * permits. Within the planned sites the ones starting soonest matter most. The
 * id is the final tiebreaker so the result is deterministic regardless of input
 * order, without needing a reference date.
 */
export function compareConstructionSitesByDefaultOrder(
  left: ConstructionSite,
  right: ConstructionSite,
): number {
  if (left.phase !== right.phase) return left.phase === "active" ? -1 : 1;

  const closureDifference =
    CLOSURE_SEVERITY_SORT_RANK[right.closure] -
    CLOSURE_SEVERITY_SORT_RANK[left.closure];
  if (closureDifference !== 0) return closureDifference;

  const startDifference = left.startDate.localeCompare(right.startDate);
  if (startDifference !== 0) {
    return left.phase === "active" ? -startDifference : startDifference;
  }
  return left.id.localeCompare(right.id);
}

/** Returns a display-sorted copy without modifying the input. */
export function sortConstructionSitesByDefaultOrder(
  constructionSites: readonly ConstructionSite[],
): ConstructionSite[] {
  return [...constructionSites].sort(compareConstructionSitesByDefaultOrder);
}

/** Sorts a copy by the selected visible column, using the id as a tiebreaker. */
export function sortConstructionSitesBy(
  constructionSites: readonly ConstructionSite[],
  sort: ConstructionSiteSort,
  currentLocation?: LngLat,
): ConstructionSite[] {
  const direction = sort.direction === "ascending" ? 1 : -1;
  return [...constructionSites].sort((left, right) => {
    const difference = compareByKey(
      left,
      right,
      sort.key,
      currentLocation,
    );
    return difference !== 0
      ? difference * direction
      : left.id.localeCompare(right.id);
  });
}
