import type { LngLat, RouteTravelMode } from "../types/index.ts";
import { simplifyToVertexLimit } from "./geometry.ts";
import { isLngLat } from "./notification-preferences.ts";

/**
 * A route between two points, for a corridor area.
 *
 * Asked once, when the visitor sets start and destination; only the simplified
 * line is stored. The FOSSGIS servers allow occasional browser requests like
 * this one (at most one per second), not live re-routing — and they see the
 * two points, which the setup screen says before anything is sent.
 */

// Keep the provider boundary here so it can be replaced independently of the UI.
const ROUTING_BASE_URL = "https://routing.openstreetmap.de";
const PROFILE_BY_TRAVEL_MODE: Record<RouteTravelMode, string> = {
  car: "routed-car",
  bike: "routed-bike",
  foot: "routed-foot",
};
/** Plenty for a street-accurate commute once 5 m wiggles are gone. */
const MAX_ROUTE_VERTICES = 400;
const MAX_ROUTE_COORDINATES = 50_000;

export function createRouteURL(
  start: LngLat,
  destination: LngLat,
  travelMode: RouteTravelMode,
): URL {
  const waypoints = [start, destination]
    .map(([longitude, latitude]) => `${longitude.toFixed(5)},${latitude.toFixed(5)}`)
    .join(";");
  const url = new URL(
    `/${PROFILE_BY_TRAVEL_MODE[travelMode]}/route/v1/driving/${waypoints}`,
    ROUTING_BASE_URL,
  );
  url.search = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    alternatives: "false",
    steps: "false",
  }).toString();
  return url;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates an untrusted OSRM response and returns the route line. */
export function parseRouteResponse(response: unknown): LngLat[] {
  if (!isRecord(response) || response.code !== "Ok" || !Array.isArray(response.routes)) {
    throw new Error("Invalid route response");
  }
  const route: unknown = response.routes[0];
  if (!isRecord(route) || !isRecord(route.geometry)) {
    throw new Error("Invalid route response");
  }
  const { type, coordinates } = route.geometry;
  if (
    type !== "LineString" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > MAX_ROUTE_COORDINATES
  ) {
    throw new Error("Invalid route response");
  }
  const line: LngLat[] = [];
  for (const coordinate of coordinates) {
    if (!isLngLat(coordinate)) throw new Error("Invalid route response");
    line.push([coordinate[0], coordinate[1]]);
  }
  return simplifyToVertexLimit(line, MAX_ROUTE_VERTICES);
}

/** No credentials, no cache, no referrer: only the two points leave the device. */
export async function searchRoute(
  start: LngLat,
  destination: LngLat,
  travelMode: RouteTravelMode,
  signal: AbortSignal,
): Promise<LngLat[]> {
  const response = await fetch(createRouteURL(start, destination, travelMode), {
    signal,
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Routing unavailable");
  return parseRouteResponse(await response.json());
}
