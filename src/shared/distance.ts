import type { LngLat } from "../types/index.ts";

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Returns the straight-line distance between two WGS84 points in meters. */
export function distanceInMeters(from: LngLat, to: LngLat): number {
  const fromLongitude = toRadians(from[0]);
  const fromLatitude = toRadians(from[1]);
  const toLongitude = toRadians(to[0]);
  const toLatitude = toRadians(to[1]);
  const latitudeDelta = toLatitude - fromLatitude;
  const longitudeDelta = toLongitude - fromLongitude;

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const boundedHaversine = Math.min(1, Math.max(0, haversine));

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(
      Math.sqrt(boundedHaversine),
      Math.sqrt(1 - boundedHaversine),
    )
  );
}

/** Formats a distance compactly without implying excessive GPS precision. */
export function formatDistance(meters: number): string {
  if (meters < 50) return "< 50 m";
  if (meters < 1_000) {
    return `${Math.round(meters / 50) * 50} m`;
  }
  return `${(meters / 1_000).toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}
