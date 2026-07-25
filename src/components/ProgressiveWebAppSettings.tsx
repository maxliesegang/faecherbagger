import { useEffect, useState } from "react";
import {
  KernAlert,
  KernButton,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import {
  getPushSubscription,
  isPushConfigured,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  updatePushPreferences,
} from "../lib/push.ts";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";
import type { NotificationArea } from "../types/index.ts";
import {
  DEFAULT_NOTIFICATION_RADIUS_KM,
  MAX_NOTIFICATION_RADIUS_KM,
  MIN_NOTIFICATION_RADIUS_KM,
} from "../lib/notification-area.ts";
import "./ProgressiveWebAppSettings.css";

const NOTIFICATIONS_STORAGE_KEY = "faecherbagger-notifications";
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

interface ProgressiveWebAppSettingsProps {
  locationController: CurrentLocationController;
  notificationArea: NotificationArea | null;
  onNotificationAreaChange: (area: NotificationArea) => void;
}

function postMessageToServiceWorker(message: object) {
  void navigator.serviceWorker.ready.then((registration) => {
    (registration.active ?? navigator.serviceWorker.controller)?.postMessage(
      message,
    );
  });
}

/** Message from a caught error, falling back to a localized default. */
const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export function ProgressiveWebAppSettings({
  locationController,
  notificationArea,
  onNotificationAreaChange,
}: ProgressiveWebAppSettingsProps) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent>();
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches,
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >(
    "Notification" in window ? Notification.permission : "unsupported",
  );
  const [areNotificationsEnabled, setAreNotificationsEnabled] = useState(
    localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) === "true",
  );
  const [feedbackMessage, setFeedbackMessage] = useState<string>();
  const [radiusKm, setRadiusKm] = useState(
    notificationArea?.radiusKm ?? DEFAULT_NOTIFICATION_RADIUS_KM,
  );
  const [isSavingArea, setIsSavingArea] = useState(false);

  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(undefined);
      setFeedbackMessage("Fächerbagger wurde installiert.");
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
              {
                minInterval: REFRESH_INTERVAL_MS,
              },
            );
          } else if (progressiveWebAppRegistration.sync) {
            await progressiveWebAppRegistration.sync.register(REFRESH_TAG);
          }
        } catch {
          // Browsers may reject background sync based on engagement or settings.
        }
        postMessageToServiceWorker({ type: "REFRESH_DATA" });
        if (isPushSupported) {
          try {
            const subscription = await getPushSubscription();
            const subscribed = Boolean(subscription);
            if (subscription && isPushConfigured) {
              await subscribeToPush(notificationArea ?? undefined);
            }
            setAreNotificationsEnabled(subscribed);
            localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(subscribed));
          } catch {
            // A temporary push API failure must not prevent the PWA from loading.
          }
        }
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

  const saveNotificationPreferences = async (
    area: NotificationArea,
    message: string,
  ) => {
    setIsSavingArea(true);
    try {
      if (areNotificationsEnabled) {
        await updatePushPreferences(area);
      }
      onNotificationAreaChange(area);
      setFeedbackMessage(message);
    } catch (error) {
      setFeedbackMessage(
        getErrorMessage(
          error,
          "Der Benachrichtigungsradius konnte nicht gespeichert werden.",
        ),
      );
    } finally {
      setIsSavingArea(false);
    }
  };

  const setNotificationAreaFromCurrentLocation = async () => {
    try {
      const point =
        locationController.locationState.status === "ready" &&
        !notificationArea
          ? locationController.locationState.point
          : await locationController.requestLocation();
      const center: [number, number] = [
        Number(point[0].toFixed(5)),
        Number(point[1].toFixed(5)),
      ];
      await saveNotificationPreferences(
        { center, radiusKm },
        areNotificationsEnabled
          ? `Benachrichtigungsradius von ${radiusKm} km ist gespeichert.`
          : `Standort und Radius von ${radiusKm} km sind vorgemerkt.`,
      );
    } catch (error) {
      setFeedbackMessage(
        getErrorMessage(error, "Der Standort konnte nicht bestimmt werden."),
      );
    }
  };

  const saveNotificationRadius = async () => {
    if (!notificationArea) {
      setFeedbackMessage(
        "Legen Sie zuerst den Mittelpunkt über Ihren Standort fest.",
      );
      return;
    }
    await saveNotificationPreferences(
      { ...notificationArea, radiusKm },
      `Benachrichtigungsradius auf ${radiusKm} km aktualisiert.`,
    );
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) return;
    if (!notificationArea) {
      setFeedbackMessage(
        "Legen Sie zuerst Standort und Radius für Benachrichtigungen fest.",
      );
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") {
        setFeedbackMessage("Benachrichtigungen wurden nicht freigegeben.");
        return;
      }
      await subscribeToPush(notificationArea);
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, "true");
      setAreNotificationsEnabled(true);
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Benachrichtigungen aktiviert", {
        body: `Sie erhalten Hinweise zu neuen Baustellen im Umkreis von ${notificationArea.radiusKm} km.`,
        icon: `${import.meta.env.BASE_URL}icons/faecherbagger-192.png`,
        badge: `${import.meta.env.BASE_URL}icons/faecherbagger-192.png`,
        tag: "faecherbagger-test",
      });
      setFeedbackMessage("Testbenachrichtigung wurde gesendet.");
    } catch (error) {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, "false");
      setAreNotificationsEnabled(false);
      setFeedbackMessage(
        getErrorMessage(
          error,
          "Benachrichtigungen konnten nicht aktiviert werden.",
        ),
      );
    }
  };

  const disableNotifications = async () => {
    try {
      await unsubscribeFromPush();
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, "false");
      setAreNotificationsEnabled(false);
      setFeedbackMessage("Baustellenbenachrichtigungen sind ausgeschaltet.");
    } catch (error) {
      setFeedbackMessage(
        getErrorMessage(
          error,
          "Benachrichtigungen konnten nicht ausgeschaltet werden.",
        ),
      );
    }
  };

  const promptAppInstallation = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(undefined);
  };

  const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const canOfferNotifications = !isIosDevice || isInstalled;

  return (
    <details className="kern-accordion pwa-panel">
      <summary className="kern-accordion__header">
        <span className="kern-title">
          {areNotificationsEnabled
            ? "Benachrichtigungen sind aktiv"
            : "App & Benachrichtigungen"}
        </span>
      </summary>
      <section className="kern-accordion__body pwa-panel__body">
        <KernText className="pwa-panel__intro">
          Neue Baustellen in Ihrem Umkreis melden lassen, App installieren oder
          Daten manuell aktualisieren.
        </KernText>

        <fieldset className="pwa-panel__area">
        <legend>Gebiet für neue Baustellen</legend>
        <KernText>
          Mittelpunkt ist Ihr gewählter Standort. Der Kreis wird auf der Karte
          angezeigt.
        </KernText>
        <div className="pwa-panel__radius">
          <label htmlFor="notification-radius">
            Radius: <strong>{radiusKm} km</strong>
          </label>
          <input
            id="notification-radius"
            type="range"
            min={MIN_NOTIFICATION_RADIUS_KM}
            max={MAX_NOTIFICATION_RADIUS_KM}
            step="1"
            value={radiusKm}
            onChange={(event) => setRadiusKm(Number(event.currentTarget.value))}
          />
        </div>
        <div className="pwa-panel__area-actions">
          <KernButton
            type="button"
            variant="secondary"
            label={
              notificationArea
                ? "Mittelpunkt aktualisieren"
                : "Meinen Standort als Mittelpunkt"
            }
            disabled={
              isSavingArea ||
              locationController.locationState.status === "requesting"
            }
            onClick={() => void setNotificationAreaFromCurrentLocation()}
          />
          {notificationArea && radiusKm !== notificationArea.radiusKm && (
            <KernButton
              type="button"
              variant="tertiary"
              label="Radius speichern"
              disabled={isSavingArea}
              onClick={() => void saveNotificationRadius()}
            />
          )}
        </div>
        {notificationArea && (
          <KernText muted>
            Gespeichert: {notificationArea.radiusKm} km um den gewählten
            Standort.
          </KernText>
        )}
        </fieldset>

        <div className="pwa-panel__actions">
        {!isInstalled && installPrompt && (
          <KernButton
            type="button"
            label="App installieren"
            onClick={() => void promptAppInstallation()}
          />
        )}
        {!areNotificationsEnabled &&
          notificationPermission !== "unsupported" &&
          canOfferNotifications &&
          isPushSupported &&
          isPushConfigured && (
          <KernButton
            type="button"
            variant="secondary"
            label="Benachrichtigungen aktivieren"
            onClick={() => void enableNotifications()}
          />
          )}
        {areNotificationsEnabled && (
          <KernButton
            type="button"
            variant="tertiary"
            label="Benachrichtigungen ausschalten"
            onClick={() => void disableNotifications()}
          />
        )}
        <KernButton
          type="button"
          variant="tertiary"
          label="Jetzt aktualisieren"
          onClick={() => {
            postMessageToServiceWorker({ type: "REFRESH_DATA" });
            setFeedbackMessage("Aktualisierung wurde angefordert.");
          }}
        />
        </div>

        {!isInstalled && !installPrompt && isIosDevice && (
        <KernText muted className="pwa-panel__hint">
          Auf iPhone/iPad: In Safari „Teilen“ und danach „Zum Home-Bildschirm“
          wählen. Benachrichtigungen sind anschließend in der installierten App
          verfügbar.
        </KernText>
        )}
        {!isPushConfigured && (
        <KernText muted className="pwa-panel__hint">
          Der Web-Push-Dienst muss für diese Bereitstellung noch konfiguriert
          werden.
        </KernText>
        )}
        {isPushConfigured && (
        <KernText muted className="pwa-panel__hint">
          Beim Aktivieren wird eine anonyme Geräteadresse beim
          Benachrichtigungsdienst gespeichert. Mittelpunkt und Radius werden
          nur zur Auswahl passender neuer Baustellen verwendet. Beim
          Ausschalten wird die Geräteadresse einschließlich Gebiet gelöscht.
        </KernText>
        )}
        {areNotificationsEnabled && !notificationArea && (
        <KernAlert variant="warning" title="Benachrichtigungsgebiet fehlt">
          <KernText>
            Legen Sie einen Standort und Radius fest, damit nur passende neue
            Baustellen gemeldet werden.
          </KernText>
        </KernAlert>
        )}
        {notificationPermission === "denied" && (
        <KernAlert
          variant="warning"
          title="Benachrichtigungen sind blockiert"
        >
          <KernText>
            Geben Sie Benachrichtigungen in den Website- oder App-Einstellungen
            Ihres Geräts frei.
          </KernText>
        </KernAlert>
        )}
        {feedbackMessage && (
        <KernText className="pwa-panel__feedback" aria-live="polite">
          {feedbackMessage}
        </KernText>
        )}
      </section>
    </details>
  );
}
