import { useCallback, useEffect, useState } from "react";
import type { NotificationPreferences } from "../types/index.ts";
import { createDefaultNotificationPreferences } from "../lib/notification-preferences.ts";
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from "../lib/notification-preferences-store.ts";
import {
  isFollowedConstructionSite,
  pruneFollowedConstructionSites,
  toggleFollowedConstructionSite,
} from "../lib/followed-construction-sites.ts";
import { MAX_FOLLOWED_SITES } from "../lib/notification-preferences.ts";

export interface NotificationPreferencesController {
  preferences: NotificationPreferences;
  /** False until IndexedDB has answered; the map waits rather than flashing. */
  isLoaded: boolean;
  setPreferences: (preferences: NotificationPreferences) => void;
  /** Whether this site is on the follow list. */
  isFollowed: (siteId: string) => boolean;
  /**
   * Follows or unfollows one site.
   *
   * Returns `false` when a *new* follow was refused because the list is full,
   * so the caller can say so. Silently doing nothing would leave a star that
   * looks pressed until the next reload.
   */
  toggleFollowed: (siteId: string) => boolean;
  /**
   * Drops follows whose site the current dataset no longer publishes.
   *
   * Never automatic: the source drops and restores records between runs, and
   * silently forgetting a follow because of a blip is not something the visitor
   * can undo. The personal screen offers it once there is actually something to
   * clean up.
   */
  pruneFollowed: (knownSiteIds: ReadonlySet<string>) => void;
}

/**
 * The device's notification preferences.
 *
 * Asynchronous because they live in IndexedDB — the service worker has to read
 * the same record to decide what a push should show, and workers cannot reach
 * `localStorage`.
 */
export function useNotificationPreferences(): NotificationPreferencesController {
  const [preferences, setStoredPreferences] = useState<NotificationPreferences>(
    createDefaultNotificationPreferences,
  );
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void loadNotificationPreferences().then((loaded) => {
      if (!isCurrent) return;
      setStoredPreferences(loaded);
      setIsLoaded(true);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  const setPreferences = useCallback(
    (updated: NotificationPreferences) => {
      // Optimistic: the UI is the source of truth for this visit, and a failed
      // write must not make an area the user just drew disappear.
      setStoredPreferences(updated);
      void saveNotificationPreferences(updated);
    },
    [],
  );

  const isFollowed = useCallback(
    (siteId: string) =>
      isFollowedConstructionSite(preferences.followedSiteIds, siteId),
    [preferences.followedSiteIds],
  );

  const toggleFollowed = useCallback(
    (siteId: string): boolean => {
      const followedSiteIds = toggleFollowedConstructionSite(
        preferences.followedSiteIds,
        siteId,
      );
      // The list arithmetic refuses a new follow at the cap by returning the
      // list unchanged; an unfollow always changes something, so an unchanged
      // list that does not contain the id is exactly the refusal case.
      if (
        followedSiteIds.length === preferences.followedSiteIds.length &&
        !followedSiteIds.includes(siteId)
      ) {
        return false;
      }
      setPreferences({ ...preferences, followedSiteIds });
      return true;
    },
    [preferences, setPreferences],
  );

  const pruneFollowed = useCallback(
    (knownSiteIds: ReadonlySet<string>) => {
      const followedSiteIds = pruneFollowedConstructionSites(
        preferences.followedSiteIds,
        knownSiteIds,
      );
      if (followedSiteIds.length === preferences.followedSiteIds.length) return;
      setPreferences({ ...preferences, followedSiteIds });
    },
    [preferences, setPreferences],
  );

  return {
    preferences,
    isLoaded,
    setPreferences,
    isFollowed,
    toggleFollowed,
    pruneFollowed,
  };
}

export { MAX_FOLLOWED_SITES };
