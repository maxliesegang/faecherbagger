import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import type {
  HomeArea,
  NotificationClosureLevel,
  NotificationPreferences,
} from "../types/index.ts";
import { readStoredText, writeStoredText } from "../lib/browser-storage.ts";
import { describeNotificationClosureLevel } from "../shared/construction-site-labels.ts";
import { toNotificationClosureLevel } from "../shared/notification-relevance.ts";
import type { PushNotificationStatus } from "../lib/notification-state.ts";
import {
  getPushSubscription,
  isPushConfigured,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  updatePushPreferences,
} from "../lib/push.ts";

const NOTIFICATIONS_STORAGE_KEY = "faecherbagger-notifications";
const CLOSURE_LEVEL_STORAGE_KEY = "faecherbagger-notification-closure-level";

/** Message from a caught error, falling back to a localized default. */
const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Owns the Web Push subscription for this device: permission, the stored
 * enabled flag, and keeping the subscribed area in step with the app's state.
 * Every operation reports its outcome through `feedbackMessage` so callers do
 * not have to translate errors themselves.
 *
 * `status` says why the visitor can or cannot receive notifications right now.
 * The UI never reads it directly: `describeNotificationState` maps it to one
 * message and one action, so the combination of browser support, deployment
 * configuration, permission and area is interpreted in exactly one place.
 */
export function usePushNotifications() {
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => ("Notification" in window ? Notification.permission : "unsupported"));
  const [isEnabled, setIsEnabled] = useState(
    () => readStoredText(NOTIFICATIONS_STORAGE_KEY) === "true",
  );
  const [isBusy, setIsBusy] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string>();

  /**
   * How disruptive a construction site has to be before this device is
   * interrupted. Device-local like the area, and sent with it: the service
   * applies it, so a device that never opens the app again keeps being filtered
   * the way its owner asked.
   */
  const [closureLevel, setStoredClosureLevel] =
    useState<NotificationClosureLevel>(() =>
      toNotificationClosureLevel(readStoredText(CLOSURE_LEVEL_STORAGE_KEY)),
    );

  // The mount-time re-subscription must use the values that are current when
  // the service worker becomes ready, without re-running that effect on every
  // edit. Both are read through refs for the same reason.
  const homeAreaRef = useRef<HomeArea | null>(null);
  const closureLevelRef = useRef(closureLevel);
  closureLevelRef.current = closureLevel;

  /** The area plus this device's threshold — what the service stores. */
  const buildPreferences = useCallback(
    (area: HomeArea): NotificationPreferences => ({
      ...area,
      closureLevel: closureLevelRef.current,
    }),
    [],
  );

  const rememberEnabled = (enabled: boolean) => {
    writeStoredText(NOTIFICATIONS_STORAGE_KEY, String(enabled));
    setIsEnabled(enabled);
  };

  useEffect(() => {
    if (!isPushSupported) return;
    let isMounted = true;

    void navigator.serviceWorker.ready.then(async () => {
      try {
        const subscription = await getPushSubscription();
        // Re-sending the subscription refreshes the stored area after a data
        // reset on the service, and keeps the expiry-based cleanup accurate.
        if (subscription && isPushConfigured) {
          const area = homeAreaRef.current;
          await subscribeToPush(area ? buildPreferences(area) : undefined);
        }
        if (isMounted) rememberEnabled(Boolean(subscription));
      } catch {
        // A temporary push failure must not prevent the app from loading.
      }
    });

    return () => {
      isMounted = false;
    };
  }, [buildPreferences]);

  /** Keeps the ref in step; called by the owner of the area state. */
  const trackHomeArea = useCallback((area: HomeArea | null) => {
    homeAreaRef.current = area;
  }, []);

  const enableNotifications = useCallback(
    async (area: HomeArea): Promise<boolean> => {
      if (!("Notification" in window)) return false;
      setIsBusy(true);
      try {
        const grantedPermission = await Notification.requestPermission();
        setPermission(grantedPermission);
        if (grantedPermission !== "granted") {
          setFeedbackMessage("Benachrichtigungen wurden nicht freigegeben.");
          return false;
        }
        await subscribeToPush(buildPreferences(area));
        rememberEnabled(true);
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification("Benachrichtigungen aktiviert", {
          body: `${describeNotificationClosureLevel(closureLevelRef.current)} im Umkreis von ${area.radiusKm} km, sobald sie kurzfristig beginnen.`,
          icon: `${import.meta.env.BASE_URL}icons/faecherbagger-192.png`,
          badge: `${import.meta.env.BASE_URL}icons/faecherbagger-192.png`,
          tag: "faecherbagger-test",
        });
        setFeedbackMessage("Testbenachrichtigung wurde gesendet.");
        return true;
      } catch (error) {
        rememberEnabled(false);
        setFeedbackMessage(
          getErrorMessage(
            error,
            "Benachrichtigungen konnten nicht aktiviert werden.",
          ),
        );
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [buildPreferences],
  );

  const disableNotifications = useCallback(async () => {
    setIsBusy(true);
    try {
      await unsubscribeFromPush();
      rememberEnabled(false);
      setFeedbackMessage("Baustellenbenachrichtigungen sind ausgeschaltet.");
    } catch (error) {
      setFeedbackMessage(
        getErrorMessage(
          error,
          "Benachrichtigungen konnten nicht ausgeschaltet werden.",
        ),
      );
    } finally {
      setIsBusy(false);
    }
  }, []);

  /**
   * Pushes a changed area to the service. Does nothing when notifications are
   * off — the area is stored locally and sent along when they are switched on.
   */
  const syncHomeArea = useCallback(
    async (area: HomeArea) => {
      if (!isEnabled) return;
      await updatePushPreferences(buildPreferences(area));
    },
    [buildPreferences, isEnabled],
  );

  /**
   * Changes what this device is interrupted for, and tells the service.
   *
   * Stored and applied even without a subscription: the level is a standing
   * preference, and switching notifications on later sends the one that is
   * already set rather than quietly starting over at the default. The outcome
   * of the transfer is reported through the same channel as every other push
   * operation, so the switch and this control speak with one voice.
   */
  const setClosureLevel = useCallback(
    (level: NotificationClosureLevel) => {
      writeStoredText(CLOSURE_LEVEL_STORAGE_KEY, level);
      closureLevelRef.current = level;
      setStoredClosureLevel(level);

      const area = homeAreaRef.current;
      if (!isEnabled || !area) return;
      void updatePushPreferences({ ...area, closureLevel: level }).catch(
        (error: unknown) => {
          setFeedbackMessage(
            getErrorMessage(
              error,
              "Die Auswahl konnte nicht an den Benachrichtigungsdienst übertragen werden.",
            ),
          );
        },
      );
    },
    [isEnabled],
  );

  const status: PushNotificationStatus = !isPushSupported
    ? "unsupported"
    : !isPushConfigured
      ? "unconfigured"
      : permission === "denied"
        ? "blocked"
        : isEnabled
          ? "enabled"
          : "disabled";

  return useMemo(
    () => ({
      status,
      isEnabled,
      isBusy,
      feedbackMessage,
      setFeedbackMessage,
      trackHomeArea,
      enableNotifications,
      disableNotifications,
      syncHomeArea,
      closureLevel,
      setClosureLevel,
    }),
    [
      closureLevel,
      disableNotifications,
      enableNotifications,
      feedbackMessage,
      isBusy,
      isEnabled,
      setClosureLevel,
      status,
      syncHomeArea,
      trackHomeArea,
    ],
  );
}

export type PushNotificationController = ReturnType<
  typeof usePushNotifications
>;
