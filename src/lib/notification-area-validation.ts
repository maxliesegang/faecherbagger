import type { LngLat, NotificationArea } from "../types/index.ts";

export const DEFAULT_NOTIFICATION_RADIUS_KM = 5;
export const MIN_NOTIFICATION_RADIUS_KM = 1;
export const MAX_NOTIFICATION_RADIUS_KM = 50;

/** Validates a WGS84 coordinate in GeoJSON `[longitude, latitude]` order. */
export function isLngLat(value: unknown): value is LngLat {
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

/**
 * Validates the notification-area shape at browser-storage and API boundaries.
 * Kept free of browser and Worker globals so every runtime uses the same rules.
 */
export function isNotificationArea(value: unknown): value is NotificationArea {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NotificationArea>;
  return (
    isLngLat(candidate.center) &&
    typeof candidate.radiusKm === "number" &&
    Number.isFinite(candidate.radiusKm) &&
    candidate.radiusKm >= MIN_NOTIFICATION_RADIUS_KM &&
    candidate.radiusKm <= MAX_NOTIFICATION_RADIUS_KM
  );
}
