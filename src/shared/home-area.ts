import type {
  ConstructionSite,
  LngLat,
  HomeArea,
} from "../types/index.ts";
import { distanceInMeters } from "../shared/distance.ts";

export {
  DEFAULT_HOME_AREA_RADIUS_KM,
  isHomeArea,
  MAX_HOME_AREA_RADIUS_KM,
  MIN_HOME_AREA_RADIUS_KM,
  HOME_AREA_CENTER_DECIMALS,
  roundHomeAreaCenter,
} from "../shared/home-area-validation.ts";

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
  return constructionSites.filter((site) =>
    isPointInHomeArea(area, site.point),
  );
}
