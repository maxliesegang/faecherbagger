import type { Baustelle, LngLat, NotificationArea } from "../types/index.ts";
import { distanceInMeters } from "./distance.ts";

export const DEFAULT_NOTIFICATION_RADIUS_KM = 5;
export const MIN_NOTIFICATION_RADIUS_KM = 1;
export const MAX_NOTIFICATION_RADIUS_KM = 50;
export const NOTIFICATION_AREA_STORAGE_KEY =
  "faecherbagger-notification-area";

function validCenter(value: unknown): value is LngLat {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

export function isNotificationArea(value: unknown): value is NotificationArea {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NotificationArea>;
  return (
    validCenter(candidate.center) &&
    typeof candidate.radiusKm === "number" &&
    Number.isFinite(candidate.radiusKm) &&
    candidate.radiusKm >= MIN_NOTIFICATION_RADIUS_KM &&
    candidate.radiusKm <= MAX_NOTIFICATION_RADIUS_KM
  );
}

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
