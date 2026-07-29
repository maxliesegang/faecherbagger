import type {
  ConstructionSite,
  ConstructionSiteChanges,
  ISOTimestamp,
  NotificationArea,
} from "../types/index.ts";
import { distanceInMeters } from "./distance.ts";
import { isPointInNotificationArea } from "./notification-area.ts";
import {
  indexConstructionSiteChanges,
  type ConstructionSiteChangeStatus,
} from "./construction-site-changes.ts";

/**
 * A construction site inside the user's notification area, annotated with the
 * two facts the surroundings view is built around: how far away it is and
 * whether it entered the change window.
 */
export interface NearbyConstructionSite {
  site: ConstructionSite;
  /** Straight-line distance from the area center in meters. */
  distanceMeters: number;
  /** `null` when the site was already known before the change window. */
  changeStatus: ConstructionSiteChangeStatus | null;
  /** When the change was first detected; `null` without a change. */
  detectedAt: ISOTimestamp | null;
}

/** How many nearby sites fall into each bucket the surroundings view shows. */
export interface NearbyConstructionSiteSummary {
  total: number;
  active: number;
  upcoming: number;
  added: number;
  modified: number;
}

const compareByDistance = (
  left: NearbyConstructionSite,
  right: NearbyConstructionSite,
): number =>
  left.distanceMeters - right.distanceMeters ||
  left.site.id.localeCompare(right.site.id);

/** Newest detection first, then nearest, so the freshest alert leads the list. */
const compareByDetectionThenDistance = (
  left: NearbyConstructionSite,
  right: NearbyConstructionSite,
): number =>
  (right.detectedAt ?? "").localeCompare(left.detectedAt ?? "") ||
  compareByDistance(left, right);

/**
 * Every construction site inside `area`, nearest first. Pure: neither the input
 * array nor its records are modified.
 */
export function selectNearbyConstructionSites(
  constructionSites: readonly ConstructionSite[],
  area: NotificationArea,
  changes?: Readonly<ConstructionSiteChanges>,
): NearbyConstructionSite[] {
  const changeIndex = changes
    ? indexConstructionSiteChanges(changes)
    : undefined;

  const nearbyConstructionSites: NearbyConstructionSite[] = [];
  for (const site of constructionSites) {
    if (!isPointInNotificationArea(area, site.point)) continue;
    const change = changeIndex?.get(site.id);
    nearbyConstructionSites.push({
      site,
      distanceMeters: distanceInMeters(area.center, site.point),
      changeStatus: change?.status ?? null,
      detectedAt: change?.detectedAt ?? null,
    });
  }
  return nearbyConstructionSites.sort(compareByDistance);
}

/**
 * The subset that is new or updated within the change window — the app's
 * primary content — ordered by detection time and then by distance.
 */
export function selectChangedNearbyConstructionSites(
  nearbyConstructionSites: readonly NearbyConstructionSite[],
): NearbyConstructionSite[] {
  return nearbyConstructionSites
    .filter((entry) => entry.changeStatus !== null)
    .sort(compareByDetectionThenDistance);
}

/**
 * True when a change was detected after the visitor last acknowledged the
 * surroundings view. Without a stored acknowledgement every change counts as
 * unseen, which is what a first visit should show.
 */
export function isUnseenConstructionSiteChange(
  detectedAt: ISOTimestamp | null,
  seenAt: ISOTimestamp | null,
): boolean {
  if (detectedAt === null) return false;
  return seenAt === null || detectedAt > seenAt;
}

/** How many of the entries carry a change the visitor has not acknowledged. */
export function countUnseenConstructionSiteChanges(
  nearbyConstructionSites: readonly NearbyConstructionSite[],
  seenAt: ISOTimestamp | null,
): number {
  return nearbyConstructionSites.filter((entry) =>
    isUnseenConstructionSiteChange(entry.detectedAt, seenAt),
  ).length;
}

/** Counts for the surroundings header; one pass over the nearby records. */
export function summarizeNearbyConstructionSites(
  nearbyConstructionSites: readonly NearbyConstructionSite[],
): NearbyConstructionSiteSummary {
  const summary: NearbyConstructionSiteSummary = {
    total: nearbyConstructionSites.length,
    active: 0,
    upcoming: 0,
    added: 0,
    modified: 0,
  };
  for (const entry of nearbyConstructionSites) {
    if (entry.site.phase === "active") summary.active += 1;
    else summary.upcoming += 1;
    if (entry.changeStatus === "added") summary.added += 1;
    else if (entry.changeStatus === "modified") summary.modified += 1;
  }
  return summary;
}
