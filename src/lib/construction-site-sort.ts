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
 * disruptive closures first, then earliest start. The id is the final
 * tiebreaker so the result is deterministic regardless of input order.
 */
export function compareConstructionSitesForDisplay(
  left: ConstructionSite,
  right: ConstructionSite,
): number {
  if (left.phase !== right.phase) return left.phase === "active" ? -1 : 1;

  const closureDifference =
    CLOSURE_SEVERITY_SORT_RANK[right.closure] -
    CLOSURE_SEVERITY_SORT_RANK[left.closure];
  if (closureDifference !== 0) return closureDifference;

  const startDifference = left.startDate.localeCompare(right.startDate);
  return startDifference !== 0
    ? startDifference
    : left.id.localeCompare(right.id);
}

/** Returns a display-sorted copy without modifying the input. */
export function sortConstructionSitesForDisplay(
  constructionSites: readonly ConstructionSite[],
): ConstructionSite[] {
  return [...constructionSites].sort(compareConstructionSitesForDisplay);
}

/** Sorts a copy by the selected visible column, using the id as a tiebreaker. */
export function sortConstructionSites(
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
