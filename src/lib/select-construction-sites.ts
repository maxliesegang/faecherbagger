import type { ConstructionSite, ISODate, ISOTimestamp } from "../types/index.ts";
import {
  createConstructionSiteFilterPredicate,
  type ConstructionSitePhaseCounts,
} from "./construction-site-filter.ts";
import { distanceInMeters } from "../shared/distance.ts";
import { isPointInHomeArea } from "../shared/home-area.ts";
import {
  getConstructionSiteRecency,
  isUnseenConstructionSite,
  type ConstructionSiteRecency,
} from "../shared/recency.ts";
import {
  compareByShortNoticeUrgency,
  getConstructionSiteTiming,
  isShortNoticeConstructionSite,
  type ConstructionSiteTiming,
} from "../shared/construction-site-timing.ts";
import {
  MATCHES_NO_DAY,
  type ConstructionSiteScope,
} from "./construction-site-scope.ts";

/**
 * A construction site with the three facts a screen needs but the record does
 * not carry, worked out once here.
 *
 * The point of annotating rather than re-deriving: every badge, count and list
 * downstream reads these fields, so none of them can disagree about whether a
 * site is new or how far away it is.
 */
export interface ScopedConstructionSite {
  constructionSite: ConstructionSite;
  /** Distance from the scope's area center; `null` when the scope has no area. */
  distanceMeters: number | null;
  /** Whether the site is new within `scope.window.since`. */
  recency: ConstructionSiteRecency;
  /** What the dates mean on `scope.window.today`. */
  timing: ConstructionSiteTiming;
  /** Whether it starts, or has just started, within the short-notice lead. */
  isShortNotice: boolean;
  /**
   * Whether the site arrived after the visitor's last acknowledgement.
   * Independent of any window — the caller decides which window to combine it
   * with, which is why the unread badge and the list can differ on scope
   * without differing on meaning.
   */
  isUnseen: boolean;
}

/**
 * Everything the two screens derive from a dataset and a
 * {@link ConstructionSiteScope}.
 */
export interface ConstructionSiteSelection {
  /** Sites in the scope's area matching its filters. */
  all: readonly ScopedConstructionSite[];
  /** The subset new within `window.since`, in the same order. */
  recent: readonly ScopedConstructionSite[];
  /**
   * What is happening in the next few days: the short-notice subset, soonest
   * start first. The app's primary answer, and the same set the push
   * notification is composed from.
   */
  shortNotice: readonly ScopedConstructionSite[];
  /** Sites under way on `window.today`, and sites still to start. */
  running: readonly ScopedConstructionSite[];
  planned: readonly ScopedConstructionSite[];
  /** What the scope asks to show: `recent` when `onlyRecent`, otherwise `all`. */
  visible: readonly ScopedConstructionSite[];
  /**
   * How many sites are new in the window before the scope's filters apply —
   * what the "Nur neue Baustellen" toggle counts, so the number does not move
   * as the visitor types a search.
   */
  recentTotal: number;
  /** Phase counts over the visible scope, with the phase filter itself lifted. */
  phaseCounts: ConstructionSitePhaseCounts;
  /**
   * Unacknowledged sites over `window.badgeSince`. Deliberately not over
   * `window.since`: see {@link RecentWindow}.
   */
  unseenCount: number;
  /**
   * The day the selection describes, carried along so a list can render a
   * timing sentence without reaching for the browser clock and disagreeing with
   * the buckets above it.
   */
  today: ISODate;
}

/**
 * A selection with nothing in it, for the states that have no scope to select
 * over: the data has not loaded, or the visitor has not defined an area yet.
 * A shared constant so those renders do not change identity every time.
 */
export const EMPTY_CONSTRUCTION_SITE_SELECTION: ConstructionSiteSelection = {
  all: [],
  recent: [],
  shortNotice: [],
  running: [],
  planned: [],
  visible: [],
  recentTotal: 0,
  phaseCounts: { total: 0, active: 0, upcoming: 0 },
  unseenCount: 0,
  today: MATCHES_NO_DAY,
};

/**
 * Most recently sighted first.
 *
 * Everything introduced by one pipeline run shares a `firstSeenAt`, so the
 * tiebreak below is the common case, not the exception.
 */
const compareByFirstSeen = (
  left: ScopedConstructionSite,
  right: ScopedConstructionSite,
): number =>
  right.constructionSite.firstSeenAt.localeCompare(
    left.constructionSite.firstSeenAt,
  );

/** …then nearest, which is the leading fact on a surroundings card. */
const compareByFirstSeenThenDistance = (
  left: ScopedConstructionSite,
  right: ScopedConstructionSite,
): number =>
  compareByFirstSeen(left, right) ||
  left.distanceMeters! - right.distanceMeters! ||
  left.constructionSite.id.localeCompare(right.constructionSite.id);

/** …then by `stand`, which at least orders within a single run. */
const compareByFirstSeenThenModified = (
  left: ScopedConstructionSite,
  right: ScopedConstructionSite,
): number =>
  compareByFirstSeen(left, right) ||
  right.constructionSite.lastModified.localeCompare(
    left.constructionSite.lastModified,
  ) ||
  left.constructionSite.id.localeCompare(right.constructionSite.id);

/**
 * The single place that turns a dataset and a {@link ConstructionSiteScope}
 * into everything a screen renders. Pure: neither the input array nor its
 * records are modified.
 *
 * Both screens go through here, so the surroundings tab badge, the surroundings
 * list, the explorer's "Nur neue" count and the explorer's results are by
 * construction answering the same question about the same records.
 */
export function selectConstructionSites(
  constructionSites: readonly ConstructionSite[],
  scope: ConstructionSiteScope,
  seenAt: ISOTimestamp | null,
): ConstructionSiteSelection {
  const { area, window, filters, onlyRecent } = scope;

  const candidates: ScopedConstructionSite[] = [];
  for (const constructionSite of constructionSites) {
    if (area && !isPointInHomeArea(area, constructionSite.point)) continue;
    candidates.push({
      constructionSite,
      distanceMeters: area
        ? distanceInMeters(area.center, constructionSite.point)
        : null,
      recency: getConstructionSiteRecency(constructionSite, window.since),
      timing: getConstructionSiteTiming(constructionSite, window.today),
      isShortNotice: isShortNoticeConstructionSite(
        constructionSite,
        window.today,
      ),
      isUnseen: isUnseenConstructionSite(constructionSite.firstSeenAt, seenAt),
    });
  }
  candidates.sort(
    area ? compareByFirstSeenThenDistance : compareByFirstSeenThenModified,
  );

  const recentCandidates = candidates.filter(
    (scoped) => scoped.recency !== null,
  );

  const matches = createConstructionSiteFilterPredicate(filters);
  const all = candidates.filter((scoped) => matches(scoped.constructionSite));
  const recent = recentCandidates.filter((scoped) =>
    matches(scoped.constructionSite),
  );

  // Urgency first, then distance: within a radius the difference between 1,8 km
  // and 3,0 km changes nothing about a visitor's plans, while the difference
  // between "beginnt morgen" and "beginnt in sieben Tagen" changes everything.
  const shortNotice = all
    .filter((scoped) => scoped.isShortNotice)
    .sort(
      (left, right) =>
        compareByShortNoticeUrgency(
          left.constructionSite,
          right.constructionSite,
          window.today,
        ) ||
        (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0) ||
        left.constructionSite.id.localeCompare(right.constructionSite.id),
    );
  // Nearest first: everything here is already under way, so the only open
  // question is which of it the visitor will actually run into.
  const running = all
    .filter((scoped) => scoped.timing === "running")
    .sort(
      (left, right) =>
        (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0) ||
        left.constructionSite.id.localeCompare(right.constructionSite.id),
    );

  // Soonest first: a list of announcements is read forwards in time, and
  // leaving it in detection order put "beginnt in 5 Tagen" above "beginnt
  // morgen".
  const planned = all
    .filter(
      (scoped) =>
        scoped.timing === "starting-soon" || scoped.timing === "later",
    )
    .sort(
      (left, right) =>
        left.constructionSite.startDate.localeCompare(
          right.constructionSite.startDate,
        ) ||
        (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0) ||
        left.constructionSite.id.localeCompare(right.constructionSite.id),
    );

  // The phase switch has to advertise what the result list can actually show,
  // so it counts the recency scope but not the filters the switch itself sets.
  const matchesWithoutPhase = createConstructionSiteFilterPredicate({
    ...filters,
    phase: "",
  });
  let active = 0;
  let upcoming = 0;
  for (const scoped of onlyRecent ? recentCandidates : candidates) {
    if (!matchesWithoutPhase(scoped.constructionSite)) continue;
    if (scoped.constructionSite.phase === "active") active += 1;
    else upcoming += 1;
  }

  let unseenCount = 0;
  for (const scoped of candidates) {
    if (
      scoped.isUnseen &&
      scoped.constructionSite.firstSeenAt >= window.badgeSince
    ) {
      unseenCount += 1;
    }
  }

  return {
    all,
    recent,
    shortNotice,
    running,
    planned,
    visible: onlyRecent ? recent : all,
    recentTotal: recentCandidates.length,
    phaseCounts: { total: active + upcoming, active, upcoming },
    unseenCount,
    today: window.today,
  };
}
