import { MAX_FOLLOWED_SITES } from "./notification-preferences.ts";

/**
 * Follow-list arithmetic.
 *
 * The counterpart to `notification-area.ts`: persistence lives in
 * `notification-preferences-store.ts` (IndexedDB, shared with the service
 * worker) and the limits live in `notification-preferences.ts`. This module is
 * only the list handling, so it stays pure and testable.
 */

export const isFollowedConstructionSite = (
  followedSiteIds: readonly string[],
  siteId: string,
): boolean => followedSiteIds.includes(siteId);

/**
 * Adds a site to the follow list, newest first.
 *
 * Newest first because the list doubles as a screen: the site someone just
 * followed is the one they are thinking about. Returns the list unchanged when
 * it is full, so the caller can say so rather than silently dropping the follow
 * — or, worse, appearing to accept it and forgetting after a reload.
 */
export function followConstructionSite(
  followedSiteIds: readonly string[],
  siteId: string,
): string[] {
  if (followedSiteIds.includes(siteId)) return [...followedSiteIds];
  if (followedSiteIds.length >= MAX_FOLLOWED_SITES) return [...followedSiteIds];
  return [siteId, ...followedSiteIds];
}

export const unfollowConstructionSite = (
  followedSiteIds: readonly string[],
  siteId: string,
): string[] => followedSiteIds.filter((candidate) => candidate !== siteId);

/** Follow or unfollow in one call, for a button that toggles. */
export const toggleFollowedConstructionSite = (
  followedSiteIds: readonly string[],
  siteId: string,
): string[] =>
  followedSiteIds.includes(siteId)
    ? unfollowConstructionSite(followedSiteIds, siteId)
    : followConstructionSite(followedSiteIds, siteId);

/**
 * Drops follows whose site is no longer published.
 *
 * Not called on every load: a site missing from one run is usually finished,
 * but the source also drops and restores records between runs, and forgetting a
 * follow because of a blip is not recoverable by the visitor. The caller
 * decides when it is safe to prune — see the follow list's own housekeeping.
 */
export const pruneFollowedConstructionSites = (
  followedSiteIds: readonly string[],
  knownSiteIds: ReadonlySet<string>,
): string[] => followedSiteIds.filter((siteId) => knownSiteIds.has(siteId));
