import type { ConstructionSite, ISOTimestamp } from "../types/index.ts";
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
import type { SiteScope } from "./site-scope.ts";

/**
 * A construction site with the three facts a screen needs but the record does
 * not carry, worked out once here.
 *
 * The point of annotating rather than re-deriving: every badge, count and list
 * downstream reads these fields, so none of them can disagree about whether a
 * site is new or how far away it is.
 */
export interface ScopedSite {
  site: ConstructionSite;
  /** Distance from the scope's area center; `null` when the scope has no area. */
  distanceMeters: number | null;
  /** Whether the site is new within `scope.window.since`. */
  recency: ConstructionSiteRecency;
  /**
   * Whether the site arrived after the visitor's last acknowledgement.
   * Independent of any window — the caller decides which window to combine it
   * with, which is why the unread badge and the list can differ on scope
   * without differing on meaning.
   */
  isUnseen: boolean;
}

/** Everything the two screens derive from a dataset and a {@link SiteScope}. */
export interface SiteSelection {
  /** Sites in the scope's area matching its filters. */
  all: readonly ScopedSite[];
  /** The subset new within `window.since`, in the same order. */
  recent: readonly ScopedSite[];
  /** What the scope asks to show: `recent` when `onlyRecent`, otherwise `all`. */
  visible: readonly ScopedSite[];
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
}

/**
 * A selection with nothing in it, for the states that have no scope to select
 * over: the data has not loaded, or the visitor has not defined an area yet.
 * A shared constant so those renders do not change identity every time.
 */
export const EMPTY_SITE_SELECTION: SiteSelection = {
  all: [],
  recent: [],
  visible: [],
  recentTotal: 0,
  phaseCounts: { total: 0, active: 0, upcoming: 0 },
  unseenCount: 0,
};

/**
 * Most recently sighted first.
 *
 * Everything introduced by one pipeline run shares a `firstSeenAt`, so the
 * tiebreak below is the common case, not the exception.
 */
const compareByFirstSeen = (left: ScopedSite, right: ScopedSite): number =>
  right.site.firstSeenAt.localeCompare(left.site.firstSeenAt);

/** …then nearest, which is the leading fact on a surroundings card. */
const compareByFirstSeenThenDistance = (
  left: ScopedSite,
  right: ScopedSite,
): number =>
  compareByFirstSeen(left, right) ||
  left.distanceMeters! - right.distanceMeters! ||
  left.site.id.localeCompare(right.site.id);

/** …then by `stand`, which at least orders within a single run. */
const compareByFirstSeenThenModified = (
  left: ScopedSite,
  right: ScopedSite,
): number =>
  compareByFirstSeen(left, right) ||
  right.site.lastModified.localeCompare(left.site.lastModified) ||
  left.site.id.localeCompare(right.site.id);

/**
 * The single place that turns a dataset and a {@link SiteScope} into everything
 * a screen renders. Pure: neither the input array nor its records are modified.
 *
 * Both screens go through here, so the surroundings tab badge, the surroundings
 * list, the explorer's "Nur neue" count and the explorer's results are by
 * construction answering the same question about the same records.
 */
export function selectSites(
  constructionSites: readonly ConstructionSite[],
  scope: SiteScope,
  seenAt: ISOTimestamp | null,
): SiteSelection {
  const { area, window, filters, onlyRecent } = scope;

  const candidates: ScopedSite[] = [];
  for (const site of constructionSites) {
    if (area && !isPointInHomeArea(area, site.point)) continue;
    candidates.push({
      site,
      distanceMeters: area ? distanceInMeters(area.center, site.point) : null,
      recency: getConstructionSiteRecency(site, window.since),
      isUnseen: isUnseenConstructionSite(site.firstSeenAt, seenAt),
    });
  }
  candidates.sort(
    area ? compareByFirstSeenThenDistance : compareByFirstSeenThenModified,
  );

  const recentCandidates = candidates.filter((entry) => entry.recency !== null);

  const matches = createConstructionSiteFilterPredicate(filters);
  const all = candidates.filter((entry) => matches(entry.site));
  const recent = recentCandidates.filter((entry) => matches(entry.site));

  // The phase switch has to advertise what the result list can actually show,
  // so it counts the recency scope but not the filters the switch itself sets.
  const matchesWithoutPhase = createConstructionSiteFilterPredicate({
    ...filters,
    phase: "",
  });
  let active = 0;
  let upcoming = 0;
  for (const entry of onlyRecent ? recentCandidates : candidates) {
    if (!matchesWithoutPhase(entry.site)) continue;
    if (entry.site.phase === "active") active += 1;
    else upcoming += 1;
  }

  let unseenCount = 0;
  for (const entry of candidates) {
    if (entry.isUnseen && entry.site.firstSeenAt >= window.badgeSince) {
      unseenCount += 1;
    }
  }

  return {
    all,
    recent,
    visible: onlyRecent ? recent : all,
    recentTotal: recentCandidates.length,
    phaseCounts: { total: active + upcoming, active, upcoming },
    unseenCount,
  };
}
