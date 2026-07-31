import type {
  ConstructionSite,
  LngLat,
  HomeArea,
} from "../types/index.ts";
import { distanceInMeters } from "../shared/distance.ts";
import { DEFAULT_HOME_AREA_RADIUS_KM } from "../shared/home-area-validation.ts";

export {
  DEFAULT_HOME_AREA_RADIUS_KM,
  isHomeArea,
  MAX_HOME_AREA_RADIUS_KM,
  MIN_HOME_AREA_RADIUS_KM,
  HOME_AREA_CENTER_DECIMALS,
  roundHomeAreaCenter,
} from "../shared/home-area-validation.ts";

/**
 * Where the app looks before the visitor has said anything: the Karlsruhe
 * Marktplatz, at the default radius.
 *
 * It exists so the first screen can answer the question instead of asking one.
 * 413 of the 515 published records are in Karlsruhe, so this is the right guess
 * for most visitors, and being wrong costs them one tap on "Umkreis ändern" —
 * strictly less than the empty screen it replaces.
 *
 * A fallback and never a stored area: `PersonalContext` keeps it out of
 * `localStorage` and out of the push subscription, because a notification must
 * only ever go to an area someone actually chose.
 */
export const FALLBACK_HOME_AREA: HomeArea = {
  center: [8.4037, 49.0094],
  radiusKm: DEFAULT_HOME_AREA_RADIUS_KM,
};

/** What the fallback area is centred on, for the hint that explains it. */
export const FALLBACK_HOME_AREA_LABEL = "Karlsruher Innenstadt";

export function isPointInHomeArea(
  area: HomeArea,
  point: LngLat,
): boolean {
  return distanceInMeters(area.center, point) <= area.radiusKm * 1_000;
}

/**
 * The sites of `constructionSites` that fall inside `area`.
 *
 * Deliberately only the geometric test: the caller decides what the candidate
 * set is. The push pipeline passes the few sites worth notifying about, so the
 * per-subscriber cost stays proportional to that set rather than to the whole
 * region.
 *
 * An area is required. A subscription without one is not notifiable at all, and
 * the caller has to treat that as its own case rather than receive everything.
 */
export function selectConstructionSitesInArea(
  constructionSites: readonly ConstructionSite[],
  area: HomeArea,
): ConstructionSite[] {
  return constructionSites.filter((constructionSite) =>
    isPointInHomeArea(area, constructionSite.point),
  );
}
