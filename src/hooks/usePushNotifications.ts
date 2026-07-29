import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationArea } from "../types/index.ts";
import { readStoredText, writeStoredText } from "../lib/browser-storage.ts";
import {
  getPushSubscription,
  isPushConfigured,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  updatePushPreferences,
} from "../lib/push.ts";
import { isIosDevice } from "./useProgressiveWebApp.ts";

const NOTIFICATIONS_STORAGE_KEY = "faecherbagger-notifications";

/**
 * Why the visitor can or cannot receive notifications right now. The panel maps
 * this to one message and one action instead of re-deriving the combination of
 * browser support, deployment configuration and permission.
 */
export type PushNotificationStatus =
  | "unsupported"
  | "unconfigured"
  | "blocked"
  | "disabled"
  | "enabled";

/**
 * Whether asking this visitor to switch notifications on can succeed: the
 * browser and deployment must support it, permission must not be blocked, and
 * on iOS the app has to be installed first. Shared by every place that offers
 * the action, so the offer and the actual attempt cannot disagree.
 */
export function canOfferPushNotifications(
  status: PushNotificationStatus,
  isInstalled: boolean,
): boolean {
  if (status !== "disabled" && status !== "enabled") return false;
  return !isIosDevice || isInstalled;
}

/** Message from a caught error, falling back to a localized default. */
const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Owns the Web Push subscription for this device: permission, the stored
 * enabled flag, and keeping the subscribed area in step with the app's state.
 * Every operation reports its outcome through `feedbackMessage` so callers do
 * not have to translate errors themselves.
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

  // The mount-time re-subscription must use the area that is current when the
  // service worker becomes ready, without re-running this effect on every edit.
  const notificationAreaRef = useRef<NotificationArea | null>(null);

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
          await subscribeToPush(notificationAreaRef.current ?? undefined);
        }
        if (isMounted) rememberEnabled(Boolean(subscription));
      } catch {
        // A temporary push failure must not prevent the app from loading.
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  /** Keeps the ref in step; called by the owner of the area state. */
  const trackNotificationArea = useCallback((area: NotificationArea | null) => {
    notificationAreaRef.current = area;
  }, []);

  const enableNotifications = useCallback(
    async (area: NotificationArea): Promise<boolean> => {
      if (!("Notification" in window)) return false;
      setIsBusy(true);
      try {
        const grantedPermission = await Notification.requestPermission();
        setPermission(grantedPermission);
        if (grantedPermission !== "granted") {
          setFeedbackMessage("Benachrichtigungen wurden nicht freigegeben.");
          return false;
        }
        await subscribeToPush(area);
        rememberEnabled(true);
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification("Benachrichtigungen aktiviert", {
          body: `Sie erhalten Hinweise zu neuen Baustellen im Umkreis von ${area.radiusKm} km.`,
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
    [],
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
  const syncNotificationArea = useCallback(
    async (area: NotificationArea) => {
      if (!isEnabled) return;
      await updatePushPreferences(area);
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

  return {
    status,
    isEnabled,
    isBusy,
    feedbackMessage,
    setFeedbackMessage,
    trackNotificationArea,
    enableNotifications,
    disableNotifications,
    syncNotificationArea,
  };
}

export type PushNotificationController = ReturnType<
  typeof usePushNotifications
>;
