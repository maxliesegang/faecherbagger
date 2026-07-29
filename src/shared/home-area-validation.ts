import type { LngLat, HomeArea } from "../types/index.ts";

export const DEFAULT_HOME_AREA_RADIUS_KM = 5;
export const MIN_HOME_AREA_RADIUS_KM = 1;
export const MAX_HOME_AREA_RADIUS_KM = 50;

/**
 * Decimal places kept on a home-area center: three, roughly 100 m.
 * The smallest radius is 1 km, so this costs the matching nothing while it
 * keeps a device position out of the stored and transmitted data. The rounding
 * is applied where an area is created and again when one is received, so the
 * value the app shows, the value in local storage and the value the push
 * service holds are always the same coarse coordinate.
 */
export const HOME_AREA_CENTER_DECIMALS = 3;

/** Reduces a center to {@link HOME_AREA_CENTER_DECIMALS} precision. */
export function roundHomeAreaCenter(center: LngLat): LngLat {
  return [
    Number(center[0].toFixed(HOME_AREA_CENTER_DECIMALS)),
    Number(center[1].toFixed(HOME_AREA_CENTER_DECIMALS)),
  ];
}

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
 * Validates the home-area shape at browser-storage and API boundaries.
 * Kept free of browser and Worker globals so every runtime uses the same rules.
 */
export function isHomeArea(value: unknown): value is HomeArea {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HomeArea>;
  return (
    isLngLat(candidate.center) &&
    typeof candidate.radiusKm === "number" &&
    Number.isFinite(candidate.radiusKm) &&
    candidate.radiusKm >= MIN_HOME_AREA_RADIUS_KM &&
    candidate.radiusKm <= MAX_HOME_AREA_RADIUS_KM
  );
}
