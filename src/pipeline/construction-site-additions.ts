import type {
  ConstructionSite,
  ConstructionSiteAdditions,
  ISOTimestamp,
} from "../types/index.ts";
import {
  recentWindowSince,
  selectRecentConstructionSites,
} from "../shared/recency.ts";

/**
 * The window `data/changes.json` publishes. Deliberately its own constant: what
 * the published artifact contains and what the app happens to show by default
 * are unrelated decisions, and tying them to one number is how the previous
 * model ended up with a retention period doubling as UI copy.
 */
export const PUBLISHED_ADDITIONS_WINDOW_DAYS = 7;

/** Builds `data/changes.json` for one pipeline run. */
export function buildConstructionSiteAdditions(
  constructionSites: readonly ConstructionSite[],
  fetchedAt: ISOTimestamp,
  windowDays: number = PUBLISHED_ADDITIONS_WINDOW_DAYS,
): ConstructionSiteAdditions {
  const since = recentWindowSince(fetchedAt, windowDays);
  return {
    fetchedAt,
    windowDays,
    since,
    added: selectRecentConstructionSites(constructionSites, since).map(
      (site) => ({
        id: site.id,
        lastModified: site.lastModified,
        firstSeenAt: site.firstSeenAt,
      }),
    ),
  };
}

/**
 * What this run should push: construction sites that appeared after the last
 * broadcast that actually completed.
 *
 * The cutoff is the last *completed* broadcast rather than the previous data
 * run, so a fan-out that died is caught up by the next run instead of being
 * skipped forever.
 *
 * A `null` cutoff means nothing has ever been broadcast: the caller records a
 * baseline instead of announcing the entire backlog to every subscriber.
 */
export function selectConstructionSitesToNotify(
  additions: Readonly<ConstructionSiteAdditions>,
  broadcastCutoff: ISOTimestamp | null,
): ConstructionSiteAdditions["added"] {
  if (broadcastCutoff === null) return [];
  return additions.added.filter((entry) => entry.firstSeenAt > broadcastCutoff);
}
