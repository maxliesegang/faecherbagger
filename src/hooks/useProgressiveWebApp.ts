import { useCallback, useEffect, useState } from "react";

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

function postMessageToServiceWorker(message: object) {
  void navigator.serviceWorker.ready.then((registration) => {
    (registration.active ?? navigator.serviceWorker.controller)?.postMessage(
      message,
    );
  });
}

/**
 * Installation and data-freshness side of the PWA: the deferred install prompt,
 * background refresh registration, and refreshing when the app comes back into
 * view. Notifications live in {@link usePushNotifications}.
 */
export function useProgressiveWebApp() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent>();
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches,
  );
  const [installMessage, setInstallMessage] = useState<string>();

  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(undefined);
      setInstallMessage("Fächerbagger wurde installiert.");
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
      });
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
  }, []);

  const promptInstallation = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(undefined);
  }, [installPrompt]);

  const requestDataRefresh = useCallback(() => {
    postMessageToServiceWorker({ type: "REFRESH_DATA" });
  }, []);

  return {
    isInstalled,
    canInstall: Boolean(installPrompt) && !isInstalled,
    installMessage,
    promptInstallation,
    requestDataRefresh,
  };
}

export type ProgressiveWebAppController = ReturnType<
  typeof useProgressiveWebApp
>;

/** iOS only exposes Web Push to apps added to the home screen. */
export const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
