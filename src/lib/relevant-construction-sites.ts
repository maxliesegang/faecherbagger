import type {
  ConstructionSite,
  ISODate,
  NotificationArea,
} from "../types/index.ts";
import { distanceInMeters } from "./distance.ts";
import {
  compareByShortNoticeUrgency,
  getConstructionSiteTiming,
  isShortNoticeConstructionSite,
  type ConstructionSiteTiming,
} from "./construction-site-timeframe.ts";

/**
 * "Which construction sites are mine?" — the one place that answers it.
 *
 * Relevance is deliberately a union of two different claims, not one rule:
 * a site is mine because it is *near a place I watch*, or because I said so by
 * following it. The first is how someone discovers a closure they did not know
 * to look for; the second is how they keep hold of one they already care about
 * after it drops out of every window. Neither subsumes the other, so both feed
 * this selector and the reason is recorded per site rather than collapsed.
 *
 * Pure and free of browser globals: the screens call it, and the same rules
 * decide what a push is allowed to interrupt someone for.
 */

/** One watched area a site falls inside, and how far it is from that centre. */
export interface AreaMatch {
  area: NotificationArea;
  distanceMeters: number;
}

/** Why a site is relevant, and everything a card needs to say about it. */
export interface RelevantConstructionSite {
  constructionSite: ConstructionSite;
  /**
   * The watched areas containing the site, nearest centre first. Empty for a
   * site that qualifies only by being followed — which is exactly why the
   * caller must not treat "no areas" as "not relevant".
   */
  areas: readonly AreaMatch[];
  /**
   * Distance to the nearest watched centre, or `null` when the site is
   * relevant only because it is followed. `null` rather than `Infinity` so a
   * card renders "gefolgt" instead of a meaningless number.
   */
  distanceMeters: number | null;
  /** Whether the visitor explicitly followed this site. */
  isFollowed: boolean;
  /** What the dates mean on `today`. */
  timing: ConstructionSiteTiming;
  /** Starts, or has just started, within the short-notice lead. */
  isShortNotice: boolean;
  /** Changed in the most recent pipeline run. */
  isChanged: boolean;
}

/** Everything the relevance screen renders, derived in one pass. */
export interface RelevanceSelection {
  /** Every relevant site, nearest first; followed-only sites last. */
  all: readonly RelevantConstructionSite[];
  /**
   * What is happening in the next few days, most urgent first. The app's
   * primary answer and the same set a notification is composed from.
   */
  shortNotice: readonly RelevantConstructionSite[];
  /** Under way on `today`, nearest first. */
  running: readonly RelevantConstructionSite[];
  /** Announced but not yet started, soonest first. */
  planned: readonly RelevantConstructionSite[];
  /** The followed subset, whether or not it falls in a watched area. */
  followed: readonly RelevantConstructionSite[];
  /** Relevant sites that changed in the last run. */
  changed: readonly RelevantConstructionSite[];
  /**
   * The day the selection describes, carried along so a list can phrase a
   * timing sentence without reaching for the browser clock and disagreeing
   * with the buckets above it.
   */
  today: ISODate;
}

/** Nothing to show: no areas watched, nothing followed, or data still loading. */
export const EMPTY_RELEVANCE_SELECTION: RelevanceSelection = {
  all: [],
  shortNotice: [],
  running: [],
  planned: [],
  followed: [],
  changed: [],
  today: "",
};

export interface RelevanceOptions {
  /** Anchor day, from the dataset's `fetchedAt` rather than the browser clock. */
  today: ISODate;
  /** Ids the visitor follows explicitly; relevant at any distance. */
  followedSiteIds?: ReadonlySet<string>;
  /** Ids changed in the last pipeline run, from `changes.json`. */
  changedSiteIds?: ReadonlySet<string>;
}

/** Distance ordering that keeps followed-only sites (`null`) at the end. */
const byDistance = (
  left: RelevantConstructionSite,
  right: RelevantConstructionSite,
): number =>
  (left.distanceMeters ?? Number.POSITIVE_INFINITY) -
    (right.distanceMeters ?? Number.POSITIVE_INFINITY) ||
  left.constructionSite.id.localeCompare(right.constructionSite.id);

/**
 * The watched areas a point falls inside, nearest centre first.
 *
 * All of them, not just the first: someone whose "Zuhause" and "Arbeit" circles
 * overlap should see why a site matters in both, and the nearest one is what
 * the card leads with.
 */
export function findAreaMatches(
  areas: readonly NotificationArea[],
  point: ConstructionSite["point"],
): AreaMatch[] {
  const matches: AreaMatch[] = [];
  for (const area of areas) {
    const distance = distanceInMeters(area.center, point);
    if (distance <= area.radiusKm * 1_000) {
      matches.push({ area, distanceMeters: distance });
    }
  }
  return matches.sort((left, right) => left.distanceMeters - right.distanceMeters);
}

/**
 * Turns the dataset plus what the visitor watches into the relevance screen.
 *
 * Pure: neither the input array nor its records are modified. One pass
 * annotates, everything below is a view over the same annotated objects, so no
 * two lists can disagree about whether a site is short notice or how far away
 * it is.
 */
export function selectRelevantConstructionSites(
  constructionSites: readonly ConstructionSite[],
  areas: readonly NotificationArea[],
  options: RelevanceOptions,
): RelevanceSelection {
  const { today, followedSiteIds, changedSiteIds } = options;

  const all: RelevantConstructionSite[] = [];
  for (const constructionSite of constructionSites) {
    const isFollowed = followedSiteIds?.has(constructionSite.id) ?? false;
    const areaMatches = findAreaMatches(areas, constructionSite.point);
    if (areaMatches.length === 0 && !isFollowed) continue;
    all.push({
      constructionSite,
      areas: areaMatches,
      distanceMeters: areaMatches[0]?.distanceMeters ?? null,
      isFollowed,
      timing: getConstructionSiteTiming(constructionSite, today),
      isShortNotice: isShortNoticeConstructionSite(constructionSite, today),
      isChanged: changedSiteIds?.has(constructionSite.id) ?? false,
    });
  }
  all.sort(byDistance);

  // Urgency before distance: within a watched radius the difference between
  // 1,8 km and 3,0 km changes nothing about someone's plans, while the
  // difference between "beginnt morgen" and "beginnt in sieben Tagen" changes
  // everything.
  const shortNotice = all
    .filter((relevant) => relevant.isShortNotice)
    .sort(
      (left, right) =>
        compareByShortNoticeUrgency(
          left.constructionSite,
          right.constructionSite,
          today,
        ) || byDistance(left, right),
    );

  // Everything here is already under way, so the only open question is which of
  // it they will actually run into: nearest first.
  const running = all.filter((relevant) => relevant.timing === "running");

  // A list of announcements is read forwards in time.
  const planned = all
    .filter(
      (relevant) =>
        relevant.timing === "starting-soon" || relevant.timing === "later",
    )
    .sort(
      (left, right) =>
        left.constructionSite.startDate.localeCompare(
          right.constructionSite.startDate,
        ) || byDistance(left, right),
    );

  return {
    all,
    shortNotice,
    running,
    planned,
    followed: all.filter((relevant) => relevant.isFollowed),
    changed: all.filter((relevant) => relevant.isChanged),
    today,
  };
}
