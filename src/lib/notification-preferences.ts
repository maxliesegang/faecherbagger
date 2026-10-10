import {
  CLOSURE_SEVERITY_SORT_RANK,
  type ClosureSeverity,
  type LngLat,
  type NotificationArea,
  type RouteTravelMode,
  type NotificationEventKind,
  type NotificationPreferences,
  type NotificationSeverityThreshold,
} from "../types/index.ts";

/**
 * Notification preferences: defaults, limits and validation.
 *
 * Deliberately free of browser and Worker globals — the app, the Cloudflare
 * Worker and the Node sender all validate against exactly these rules, so a
 * value that one of them accepts cannot surprise the others.
 */

export const DEFAULT_NOTIFICATION_RADIUS_KM = 1;
export const MIN_NOTIFICATION_RADIUS_KM = 0.25;
export const MAX_NOTIFICATION_RADIUS_KM = 50;

/**
 * The radii the picker offers: fine-grained in town, where a kilometre is a
 * whole district, and coarser further out. Any value within the min/max bounds
 * is still valid, so areas saved with the old 1 km steps keep working.
 */
export const NOTIFICATION_RADIUS_STEPS_KM: readonly number[] = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 15, 20, 30, 40,
  50,
];

/** Index of the offered radius closest to `radiusKm`. */
export function findNearestNotificationRadiusStepIndex(
  radiusKm: number,
): number {
  let nearestIndex = 0;
  NOTIFICATION_RADIUS_STEPS_KM.forEach((stepKm, index) => {
    if (
      Math.abs(stepKm - radiusKm) <
      Math.abs(NOTIFICATION_RADIUS_STEPS_KM[nearestIndex] - radiusKm)
    ) {
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

/** German display text for a radius, e.g. "0,5 km" or "5 km". */
export function formatNotificationRadius(radiusKm: number): string {
  return `${radiusKm.toLocaleString("de-DE", { maximumFractionDigits: 2 })} km`;
}

/** Watching more places than this is a data-collection problem, not a feature. */
export const MAX_NOTIFICATION_AREAS = 5;

/**
 * The cap on hand-followed sites.
 *
 * Higher than the area cap because the cost is different: an area is a standing
 * claim about where someone lives, while a followed site is one road works that
 * resolves itself. The limit is here to bound the stored record and the service
 * worker's matching, not to ration the feature.
 */
export const MAX_FOLLOWED_SITES = 50;
export const MAX_NOTIFICATION_AREA_LABEL_LENGTH = 40;

/** Distances to either side of a route the corridor picker offers. */
export const CORRIDOR_WIDTH_STEPS_METERS: readonly number[] = [100, 250, 500, 1000];
export const DEFAULT_CORRIDOR_WIDTH_METERS = 250;
const MIN_CORRIDOR_WIDTH_METERS = 25;
const MAX_CORRIDOR_WIDTH_METERS = 2_000;

/**
 * Vertex caps. They bound what the service worker checks on every push and
 * what a stored record can grow to; drawing and routing simplify to fit.
 */
export const MAX_POLYGON_VERTICES = 300;
export const MAX_CORRIDOR_VERTICES = 1_000;
const MAX_AREA_NAME_LENGTH = 100;

export const ROUTE_TRAVEL_MODES: readonly RouteTravelMode[] = ["car", "bike", "foot"];

/** German display text for a corridor width, e.g. "250 m" or "1 km". */
export function formatCorridorWidth(widthMeters: number): string {
  return widthMeters >= 1_000
    ? formatNotificationRadius(widthMeters / 1_000)
    : `${Math.round(widthMeters)} m`;
}

export const NOTIFICATION_EVENT_KINDS: readonly NotificationEventKind[] = [
  "new",
  "starts-soon",
  "changed",
];

export const NOTIFICATION_SEVERITY_THRESHOLDS: readonly NotificationSeverityThreshold[] =
  ["all", "obstruction", "closure"];

/** Lowest severity rank each threshold still notifies about. */
const MINIMUM_RANK_BY_THRESHOLD: Record<NotificationSeverityThreshold, number> =
  {
    all: CLOSURE_SEVERITY_SORT_RANK.none,
    obstruction: CLOSURE_SEVERITY_SORT_RANK.obstruction,
    closure: CLOSURE_SEVERITY_SORT_RANK["one-direction"],
  };

/**
 * Whether a site is disruptive enough for the chosen threshold.
 *
 * `unknown` always passes: the source leaves `sperrung` empty on real closures
 * often enough that treating "no statement" as "harmless" would silently drop
 * exactly the notifications people signed up for.
 */
export function meetsSeverityThreshold(
  closure: ClosureSeverity,
  threshold: NotificationSeverityThreshold,
): boolean {
  if (closure === "unknown") return true;
  return (
    CLOSURE_SEVERITY_SORT_RANK[closure] >= MINIMUM_RANK_BY_THRESHOLD[threshold]
  );
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  areas: [],
  kinds: ["new", "starts-soon", "changed"],
  minSeverity: "obstruction",
  followedSiteIds: [],
  remindDayBefore: true,
  notifyEarly: false,
};

/** A writable copy for React state and storage fallbacks. */
export function createDefaultNotificationPreferences(): NotificationPreferences {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    kinds: [...DEFAULT_NOTIFICATION_PREFERENCES.kinds],
    areas: [],
    followedSiteIds: [],
  };
}

/** A site id as stored: non-empty and bounded, matching `ConstructionSite.id`. */
const isFollowedSiteId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 64;

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

const isLngLatList = (
  value: unknown,
  minLength: number,
  maxLength: number,
): value is LngLat[] =>
  Array.isArray(value) &&
  value.length >= minLength &&
  value.length <= maxLength &&
  value.every(isLngLat);

const isAreaName = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= MAX_AREA_NAME_LENGTH;

export function isNotificationArea(value: unknown): value is NotificationArea {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const hasIdentity =
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    candidate.id.length <= 64 &&
    typeof candidate.label === "string" &&
    candidate.label.trim().length > 0 &&
    candidate.label.length <= MAX_NOTIFICATION_AREA_LABEL_LENGTH;
  if (!hasIdentity) return false;
  switch (candidate.kind) {
    case "circle":
      return (
        isLngLat(candidate.center) &&
        typeof candidate.radiusKm === "number" &&
        Number.isFinite(candidate.radiusKm) &&
        candidate.radiusKm >= MIN_NOTIFICATION_RADIUS_KM &&
        candidate.radiusKm <= MAX_NOTIFICATION_RADIUS_KM
      );
    case "polygon":
      return isLngLatList(candidate.ring, 3, MAX_POLYGON_VERTICES);
    case "corridor": {
      const route = candidate.route as Record<string, unknown> | undefined;
      return (
        isLngLatList(candidate.line, 2, MAX_CORRIDOR_VERTICES) &&
        typeof candidate.widthMeters === "number" &&
        Number.isFinite(candidate.widthMeters) &&
        candidate.widthMeters >= MIN_CORRIDOR_WIDTH_METERS &&
        candidate.widthMeters <= MAX_CORRIDOR_WIDTH_METERS &&
        (route === undefined ||
          (typeof route === "object" &&
            route !== null &&
            isLngLat(route.start) &&
            isLngLat(route.destination) &&
            ROUTE_TRAVEL_MODES.includes(route.travelMode as RouteTravelMode)))
      );
    }
    case "municipality":
      return isAreaName(candidate.municipality);
    case "street":
      return (
        isAreaName(candidate.street) &&
        isAreaName(candidate.municipality) &&
        (candidate.includeJunctions === undefined ||
          typeof candidate.includeJunctions === "boolean")
      );
    default:
      return false;
  }
}

/**
 * An area as stored, upgraded where it predates area kinds: every area saved
 * before outlines and routes existed is a circle without a `kind`.
 */
export function coerceNotificationArea(
  value: unknown,
): NotificationArea | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate =
    "kind" in value ? value : { ...value, kind: "circle" as const };
  return isNotificationArea(candidate) ? candidate : undefined;
}

export function isNotificationPreferences(
  value: unknown,
): value is NotificationPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NotificationPreferences>;
  const areas = candidate.areas;
  const kinds = candidate.kinds;
  return (
    (candidate.remindDayBefore === undefined ||
      typeof candidate.remindDayBefore === "boolean") &&
    (candidate.notifyEarly === undefined ||
      typeof candidate.notifyEarly === "boolean") &&
    Array.isArray(areas) &&
    areas.length <= MAX_NOTIFICATION_AREAS &&
    areas.every(isNotificationArea) &&
    new Set(areas.map(({ id }) => id)).size === areas.length &&
    Array.isArray(kinds) &&
    kinds.length > 0 &&
    new Set(kinds).size === kinds.length &&
    kinds.every((kind) =>
      NOTIFICATION_EVENT_KINDS.includes(kind as NotificationEventKind),
    ) &&
    NOTIFICATION_SEVERITY_THRESHOLDS.includes(
      candidate.minSeverity as NotificationSeverityThreshold,
    ) &&
    Array.isArray(candidate.followedSiteIds) &&
    candidate.followedSiteIds.length <= MAX_FOLLOWED_SITES &&
    candidate.followedSiteIds.every(isFollowedSiteId) &&
    new Set(candidate.followedSiteIds).size === candidate.followedSiteIds.length
  );
}

/**
 * Coerces stored or transmitted preferences into a usable value, dropping only
 * the parts that are invalid.
 *
 * A subscriber whose stored shape predates a change — or who lost one malformed
 * area — should keep receiving notifications for the rest rather than silently
 * falling back to "everything" or to "nothing".
 */
export function coerceNotificationPreferences(
  value: unknown,
): NotificationPreferences {
  if (!value || typeof value !== "object") {
    return createDefaultNotificationPreferences();
  }
  const candidate = value as Partial<NotificationPreferences>;
  const areas: NotificationArea[] = [];
  if (Array.isArray(candidate.areas)) {
    for (const value of candidate.areas) {
      const area = coerceNotificationArea(value);
      if (area && !areas.some(({ id }) => id === area.id)) {
        areas.push(area);
      }
      if (areas.length === MAX_NOTIFICATION_AREAS) break;
    }
  }
  const kinds = Array.isArray(candidate.kinds)
    ? NOTIFICATION_EVENT_KINDS.filter((kind) =>
        (candidate.kinds as unknown[]).includes(kind),
      )
    : [];
  const followedSiteIds: string[] = [];
  if (Array.isArray(candidate.followedSiteIds)) {
    for (const siteId of candidate.followedSiteIds) {
      if (isFollowedSiteId(siteId) && !followedSiteIds.includes(siteId)) {
        followedSiteIds.push(siteId);
      }
      if (followedSiteIds.length === MAX_FOLLOWED_SITES) break;
    }
  }
  return {
    areas,
    followedSiteIds,
    kinds:
      kinds.length > 0 ? kinds : [...DEFAULT_NOTIFICATION_PREFERENCES.kinds],
    remindDayBefore:
      typeof candidate.remindDayBefore === "boolean"
        ? candidate.remindDayBefore
        : true,
    notifyEarly:
      typeof candidate.notifyEarly === "boolean" ? candidate.notifyEarly : false,
    minSeverity: NOTIFICATION_SEVERITY_THRESHOLDS.includes(
      candidate.minSeverity as NotificationSeverityThreshold,
    )
      ? (candidate.minSeverity as NotificationSeverityThreshold)
      : DEFAULT_NOTIFICATION_PREFERENCES.minSeverity,
  };
}
