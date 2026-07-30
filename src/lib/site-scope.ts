import type { ISODate, ISOTimestamp, HomeArea } from "../types/index.ts";
import { toBerlinCalendarDate } from "../shared/construction-site-timing.ts";
import {
  EMPTY_CONSTRUCTION_SITE_FILTERS,
  type ConstructionSiteFilters,
} from "./construction-site-filter.ts";
import {
  DEFAULT_RECENT_WINDOW_DAYS,
  recentWindowSince,
  type RecentWindowDays,
} from "../shared/recency.ts";

/**
 * A window start far enough in the future to match nothing, used while the
 * dataset is still loading so a half-loaded app cannot claim anything is new.
 */
export const MATCHES_NOTHING: ISOTimestamp = "9999-12-31T00:00:00.000Z";

/** The same guard as a calendar date: every record reads as long over. */
export const MATCHES_NO_DAY: ISODate = "9999-12-31";

/**
 * The two window starts a screen needs, derived together so they cannot drift.
 *
 * `since` follows the visitor's time filter. `badgeSince` deliberately does not:
 * the unread badge answers "is there something you have not looked at?", which
 * must be a fact about the data and the acknowledgement, not something that
 * changes because someone picked a different filter. Keeping both on one object
 * is what stops a caller from reaching for the wrong one.
 */
export interface RecentWindow {
  days: RecentWindowDays;
  /** Start of the visitor's chosen window. */
  since: ISOTimestamp;
  /** Start of the fixed window the unread badge counts over. */
  badgeSince: ISOTimestamp;
  /**
   * The day the dataset describes, in the Europe/Berlin calendar — what
   * "heute", "beginnt morgen" and "kurzfristig" are measured against. It rides
   * on the window because it comes from the same `fetchedAt` and must not be
   * taken from the browser clock either.
   */
  today: ISODate;
}

/**
 * Builds the window for one render.
 *
 * Anchored to `fetchedAt` rather than the browser clock: the dataset is up to
 * twelve hours old, so measuring from "now" would silently shrink the window
 * between two pipeline runs. A `null` `fetchedAt` means the data has not
 * arrived yet and yields a window that matches nothing.
 */
export function createRecentWindow(
  fetchedAt: ISOTimestamp | null,
  days: RecentWindowDays,
): RecentWindow {
  if (fetchedAt === null) {
    return {
      days,
      since: MATCHES_NOTHING,
      badgeSince: MATCHES_NOTHING,
      today: MATCHES_NO_DAY,
    };
  }
  return {
    days,
    since: recentWindowSince(fetchedAt, days),
    badgeSince: recentWindowSince(fetchedAt, DEFAULT_RECENT_WINDOW_DAYS),
    today: toBerlinCalendarDate(fetchedAt),
  };
}

/**
 * The part of a {@link SiteScope} the address bar owns, and therefore the part
 * that is shareable.
 *
 * A scope also needs an area and a window, and the URL can supply neither: the
 * area is personal and lives on the device, and the window has to be measured
 * from the dataset's own `fetchedAt`. Naming the shareable subset separately is
 * what keeps that boundary visible — see {@link createRegionScope}.
 */
export interface SiteQuery {
  filters: Readonly<ConstructionSiteFilters>;
  /** Narrows to sites new within the window. */
  onlyRecent: boolean;
  windowDays: RecentWindowDays;
}

export const DEFAULT_SITE_QUERY: Readonly<SiteQuery> = {
  filters: EMPTY_CONSTRUCTION_SITE_FILTERS,
  onlyRecent: false,
  windowDays: DEFAULT_RECENT_WINDOW_DAYS,
};

/**
 * The complete description of what a visitor is asking to see.
 *
 * Both screens are the same question with different fields set: the
 * surroundings view sets `area` and leaves the filters empty, the explorer
 * fills in filters and leaves `area` null. That is what lets one selector serve
 * both, so "was ist neu?" cannot be answered differently in two places.
 */
export interface SiteScope {
  /** Restricts to a radius around a point; `null` means the whole region. */
  area: HomeArea | null;
  window: RecentWindow;
  filters: Readonly<ConstructionSiteFilters>;
  /** Narrows the visible set to sites new within `window.since`. */
  onlyRecent: boolean;
}

/**
 * The scope of the surroundings screen: one area, no filters, both lists.
 *
 * It deliberately ignores the {@link SiteQuery}. The explorer's search and
 * status filters belong to the explorer; carrying them over would mean a link
 * shared from one screen quietly narrows the other.
 */
export function createAreaScope(
  area: HomeArea | null,
  window: RecentWindow,
): SiteScope {
  return {
    area,
    window,
    filters: EMPTY_CONSTRUCTION_SITE_FILTERS,
    onlyRecent: false,
  };
}

/** The scope of the explorer: the whole region, narrowed by the shared query. */
export function createRegionScope(
  query: Readonly<SiteQuery>,
  window: RecentWindow,
): SiteScope {
  return {
    area: null,
    window,
    filters: query.filters,
    onlyRecent: query.onlyRecent,
  };
}
