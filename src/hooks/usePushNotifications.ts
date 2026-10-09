import { useCallback, useEffect, useState } from "react";
import {
  getServerSubscriptionState,
  isPushConfigured,
  isPushSupported,
  sendTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
} from "../lib/push.ts";

const REFRESH_TAG = "refresh-baustellen";
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PeriodicSyncManager {
  register(tag: string, options: { minInterval: number }): Promise<void>;
}

interface BackgroundSyncManager {
  register(tag: string): Promise<void>;
}

type ProgressiveWebAppRegistration = ServiceWorkerRegistration & {
  periodicSync?: PeriodicSyncManager;
  sync?: BackgroundSyncManager;
};

/**
 * Whether this device receives notifications, as far as the *server* is
 * concerned. `unknown` is the honest state before the check completes — no
 * surface may claim "an" on the strength of a local flag.
 */
export type PushSubscriptionState = "unknown" | "registered" | "inactive";

/**
 * Why notifications cannot be switched on here, if they cannot.
 *
 * - `unconfigured`: this build has no push endpoint.
 * - `unsupported`: the browser lacks Push or Notification.
 * - `needs-install`: iOS only delivers push to an installed web app.
 * - `denied`: the visitor blocked notifications for this site.
 */
export type PushUnavailableReason =
  | "unconfigured"
  | "unsupported"
  | "needs-install"
  | "denied";

export interface PushNotificationsController {
  subscriptionState: PushSubscriptionState;
  isActive: boolean;
  /** `undefined` when the switch can be offered. */
  unavailableReason?: PushUnavailableReason;
  isBusy: boolean;
  /** Last outcome worth telling the visitor, for a `role="status"` line. */
  feedbackMessage?: string;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  sendTest: () => Promise<void>;
  isInstalled: boolean;
  /** Only set while the browser offers its own install prompt. */
  install?: () => Promise<void>;
  refreshData: () => void;
}

function postMessageToServiceWorker(message: object) {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready.then((registration) => {
    (registration.active ?? navigator.serviceWorker.controller)?.postMessage(
      message,
    );
  });
}

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Push subscription, install prompt and background refresh for the whole app.
 *
 * Lives once at the top: the setup dialog, the personal screen and the settings
 * screen all show the same switch, and before this each mounted copy ran its
 * own server check and service-worker registration.
 */
export function usePushNotifications(): PushNotificationsController {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent>();
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches,
  );
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => ("Notification" in window ? Notification.permission : "unsupported"));
  const [subscriptionState, setSubscriptionState] =
    useState<PushSubscriptionState>("unknown");
  const [feedbackMessage, setFeedbackMessage] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);

  const refreshSubscriptionState = useCallback(async () => {
    try {
      const state = await getServerSubscriptionState();
      setSubscriptionState(state === "registered" ? "registered" : "inactive");
    } catch {
      // A temporary failure of the notification service is not evidence that
      // the device is unsubscribed, so the state stays unknown.
      setSubscriptionState("unknown");
    }
  }, []);

  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(undefined);
      setFeedbackMessage("App installiert.");
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then(async (registration) => {
        const progressiveWebAppRegistration =
          registration as ProgressiveWebAppRegistration;
        try {
          if (progressiveWebAppRegistration.periodicSync) {
            await progressiveWebAppRegistration.periodicSync.register(
              REFRESH_TAG,
              { minInterval: REFRESH_INTERVAL_MS },
            );
          } else if (progressiveWebAppRegistration.sync) {
            await progressiveWebAppRegistration.sync.register(REFRESH_TAG);
          }
        } catch {
          // Browsers may reject background sync based on engagement or settings.
        }
        postMessageToServiceWorker({ type: "REFRESH_DATA" });
        await refreshSubscriptionState();
      });
    } else {
      setSubscriptionState("inactive");
    }

    const refreshWhenOnline = () => {
      if (document.visibilityState === "visible") {
        postMessageToServiceWorker({ type: "REFRESH_DATA" });
      }
    };
    window.addEventListener("online", refreshWhenOnline);
    document.addEventListener("visibilitychange", refreshWhenOnline);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", refreshWhenOnline);
      document.removeEventListener("visibilitychange", refreshWhenOnline);
    };
  }, [refreshSubscriptionState]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!("Notification" in window)) return false;
    setIsBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setFeedbackMessage("Benachrichtigungen nicht erlaubt.");
        return false;
      }
      await subscribeToPush();
      await refreshSubscriptionState();
      setFeedbackMessage("Benachrichtigungen sind an.");
      return true;
    } catch (error) {
      setFeedbackMessage(
        getErrorMessage(error, "Benachrichtigungen ließen sich nicht einschalten."),
      );
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [refreshSubscriptionState]);

  const disable = useCallback(async () => {
    setIsBusy(true);
    try {
      await unsubscribeFromPush();
      setSubscriptionState("inactive");
      setFeedbackMessage("Benachrichtigungen sind aus.");
    } catch (error) {
      setFeedbackMessage(
        getErrorMessage(error, "Benachrichtigungen ließen sich nicht ausschalten."),
      );
    } finally {
      setIsBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setIsBusy(true);
    try {
      await sendTestNotification();
      setFeedbackMessage("Testnachricht gesendet.");
    } catch (error) {
      setFeedbackMessage(
        getErrorMessage(error, "Testnachricht konnte nicht gesendet werden."),
      );
    } finally {
      setIsBusy(false);
    }
  }, []);

  const install = installPrompt
    ? async () => {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === "accepted") setIsInstalled(true);
        setInstallPrompt(undefined);
      }
    : undefined;

  const refreshData = useCallback(() => {
    postMessageToServiceWorker({ type: "REFRESH_DATA" });
    setFeedbackMessage("Daten werden aktualisiert.");
  }, []);

  const isIOSDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isActive = subscriptionState === "registered";
  const unavailableReason: PushUnavailableReason | undefined = isActive
    ? undefined
    : !isPushConfigured
      ? "unconfigured"
      : !isPushSupported || permission === "unsupported"
        ? isIOSDevice && !isInstalled
          ? "needs-install"
          : "unsupported"
        : isIOSDevice && !isInstalled
          ? "needs-install"
          : permission === "denied"
            ? "denied"
            : undefined;

  return {
    subscriptionState,
    isActive,
    unavailableReason,
    isBusy,
    feedbackMessage,
    enable,
    disable,
    sendTest,
    isInstalled,
    install,
    refreshData,
  };
}
