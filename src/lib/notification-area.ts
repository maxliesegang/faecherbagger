import type { Baustelle, LngLat, NotificationArea } from "../types/index.ts";
import { distanceInMeters } from "./distance.ts";
import { isNotificationArea } from "./notification-area-validation.ts";
export {
  DEFAULT_NOTIFICATION_RADIUS_KM,
  isNotificationArea,
  MAX_NOTIFICATION_RADIUS_KM,
  MIN_NOTIFICATION_RADIUS_KM,
} from "./notification-area-validation.ts";

export const NOTIFICATION_AREA_STORAGE_KEY =
  "faecherbagger-notification-area";

export function loadNotificationArea(): NotificationArea | null {
  try {
    const stored = localStorage.getItem(NOTIFICATION_AREA_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isNotificationArea(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveNotificationArea(area: NotificationArea): void {
  localStorage.setItem(NOTIFICATION_AREA_STORAGE_KEY, JSON.stringify(area));
}

export function notificationAreaContains(
  area: NotificationArea,
  point: LngLat,
): boolean {
  return distanceInMeters(area.center, point) <= area.radiusKm * 1_000;
}

export function matchingNewBaustellen(
  records: readonly Baustelle[],
  addedIds: ReadonlySet<string>,
  area?: NotificationArea,
): Baustelle[] {
  return records.filter(
    (record) =>
      addedIds.has(record.id) &&
      (!area || notificationAreaContains(area, record.point)),
  );
}
