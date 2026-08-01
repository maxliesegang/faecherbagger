import {
  CLOSURE_SEVERITY_SORT_RANK,
  type ClosureSeverity,
  type LngLat,
  type NotificationArea,
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

export const DEFAULT_NOTIFICATION_RADIUS_KM = 5;
export const MIN_NOTIFICATION_RADIUS_KM = 1;
export const MAX_NOTIFICATION_RADIUS_KM = 50;

/** Watching more places than this is a data-collection problem, not a feature. */
export const MAX_NOTIFICATION_AREAS = 5;
export const MAX_NOTIFICATION_AREA_LABEL_LENGTH = 40;

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
};

/** A writable copy for React state and storage fallbacks. */
export function createDefaultNotificationPreferences(): NotificationPreferences {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    kinds: [...DEFAULT_NOTIFICATION_PREFERENCES.kinds],
  };
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

export function isNotificationArea(value: unknown): value is NotificationArea {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NotificationArea>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    candidate.id.length <= 64 &&
    typeof candidate.label === "string" &&
    candidate.label.trim().length > 0 &&
    candidate.label.length <= MAX_NOTIFICATION_AREA_LABEL_LENGTH &&
    isLngLat(candidate.center) &&
    typeof candidate.radiusKm === "number" &&
    Number.isFinite(candidate.radiusKm) &&
    candidate.radiusKm >= MIN_NOTIFICATION_RADIUS_KM &&
    candidate.radiusKm <= MAX_NOTIFICATION_RADIUS_KM
  );
}

export function isNotificationPreferences(
  value: unknown,
): value is NotificationPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NotificationPreferences>;
  const areas = candidate.areas;
  const kinds = candidate.kinds;
  return (
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
    )
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
    for (const area of candidate.areas) {
      if (
        isNotificationArea(area) &&
        !areas.some(({ id }) => id === area.id)
      ) {
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
  return {
    areas,
    kinds:
      kinds.length > 0 ? kinds : [...DEFAULT_NOTIFICATION_PREFERENCES.kinds],
    minSeverity: NOTIFICATION_SEVERITY_THRESHOLDS.includes(
      candidate.minSeverity as NotificationSeverityThreshold,
    )
      ? (candidate.minSeverity as NotificationSeverityThreshold)
      : DEFAULT_NOTIFICATION_PREFERENCES.minSeverity,
  };
}
