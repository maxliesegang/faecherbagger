import type {
  ConstructionSite,
  LngLat,
  NotificationArea,
} from "../types/index.ts";
import {
  readStoredJSON,
  removeStoredText,
  writeStoredJSON,
} from "./browser-storage.ts";
import { distanceInMeters } from "./distance.ts";
import { isNotificationArea } from "./notification-area-validation.ts";
export {
  DEFAULT_NOTIFICATION_RADIUS_KM,
  isNotificationArea,
  MAX_NOTIFICATION_RADIUS_KM,
  MIN_NOTIFICATION_RADIUS_KM,
  NOTIFICATION_CENTER_DECIMALS,
  roundNotificationCenter,
} from "./notification-area-validation.ts";

export const NOTIFICATION_AREA_STORAGE_KEY =
  "faecherbagger-notification-area";

export function loadNotificationArea(): NotificationArea | null {
  return readStoredJSON(NOTIFICATION_AREA_STORAGE_KEY, isNotificationArea);
}

export function saveNotificationArea(area: NotificationArea): void {
  writeStoredJSON(NOTIFICATION_AREA_STORAGE_KEY, area);
}

export function clearNotificationArea(): void {
  removeStoredText(NOTIFICATION_AREA_STORAGE_KEY);
}

export function isPointInNotificationArea(
  area: NotificationArea,
  point: LngLat,
): boolean {
  return distanceInMeters(area.center, point) <= area.radiusKm * 1_000;
}

/**
 * What one subscriber should be pushed for a data run: the sites of `addedIds`
 * that fall inside their area.
 *
 * This is deliberately the narrow, added-only view, and it exists only for the
 * notification path — a push interrupts someone, so it is reserved for a
 * construction site that was not there before. The in-app surroundings view is
 * not built on this: it has the whole dataset and both the added and the
 * modified entries, and derives its own, broader state from them
 * (see `selectNearbyConstructionSites`).
 *
 * An area is required. A subscription without one is not notifiable at all, and
 * the caller has to treat that as its own case rather than receive everything.
 */
export function selectNotifiableConstructionSites(
  constructionSites: readonly ConstructionSite[],
  addedIds: ReadonlySet<string>,
  area: NotificationArea,
): ConstructionSite[] {
  return constructionSites.filter(
    (site) =>
      addedIds.has(site.id) && isPointInNotificationArea(area, site.point),
  );
}
