import { useCallback, useEffect, useState } from "react";
import type { NotificationPreferences } from "../types/index.ts";
import { createDefaultNotificationPreferences } from "../lib/notification-preferences.ts";
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from "../lib/notification-preferences-store.ts";

export interface NotificationPreferencesController {
  preferences: NotificationPreferences;
  /** False until IndexedDB has answered; the map waits rather than flashing. */
  isLoaded: boolean;
  setPreferences: (preferences: NotificationPreferences) => void;
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

  return { preferences, isLoaded, setPreferences };
}
