import { useEffect, useState } from "react";
import {
  KernAlert,
  KernButton,
  KernHeading,
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
import "./PwaControls.css";

const NOTIFICATIONS_KEY = "faecherbagger-notifications";
const REFRESH_TAG = "refresh-baustellen";
const REFRESH_INTERVAL = 12 * 60 * 60 * 1000;

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

type PwaRegistration = ServiceWorkerRegistration & {
  periodicSync?: PeriodicSyncManager;
  sync?: BackgroundSyncManager;
};

interface Props {
  location: CurrentLocationController;
  notificationArea: NotificationArea | null;
  onNotificationAreaChange: (area: NotificationArea) => void;
}

function sendToWorker(message: object) {
  void navigator.serviceWorker.ready.then((registration) => {
    (registration.active ?? navigator.serviceWorker.controller)?.postMessage(
      message,
    );
  });
}

export function PwaControls({
  location,
  notificationArea,
  onNotificationAreaChange,
}: Props) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent>();
  const [installed, setInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches,
  );
  const [notificationState, setNotificationState] = useState<
    NotificationPermission | "unsupported"
  >(
    "Notification" in window ? Notification.permission : "unsupported",
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    localStorage.getItem(NOTIFICATIONS_KEY) === "true",
  );
  const [feedback, setFeedback] = useState<string>();
  const [radiusKm, setRadiusKm] = useState(
    notificationArea?.radiusKm ?? DEFAULT_NOTIFICATION_RADIUS_KM,
  );
  const [savingArea, setSavingArea] = useState(false);

  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(undefined);
      setFeedback("Fächerbagger wurde installiert.");
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then(async (registration) => {
        const pwaRegistration = registration as PwaRegistration;
        try {
          if (pwaRegistration.periodicSync) {
            await pwaRegistration.periodicSync.register(REFRESH_TAG, {
              minInterval: REFRESH_INTERVAL,
            });
          } else if (pwaRegistration.sync) {
            await pwaRegistration.sync.register(REFRESH_TAG);
          }
        } catch {
          // Browsers may reject background sync based on engagement or settings.
        }
        sendToWorker({ type: "REFRESH_DATA" });
        if (isPushSupported) {
          try {
            const subscription = await getPushSubscription();
            const subscribed = Boolean(subscription);
            if (subscription && isPushConfigured) {
              await subscribeToPush(notificationArea ?? undefined);
            }
            setNotificationsEnabled(subscribed);
            localStorage.setItem(NOTIFICATIONS_KEY, String(subscribed));
          } catch {
            // A temporary push API failure must not prevent the PWA from loading.
          }
        }
      });
    }

    const refreshWhenOnline = () => {
      if (document.visibilityState === "visible") {
        sendToWorker({ type: "REFRESH_DATA" });
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

  const saveArea = async (area: NotificationArea, message: string) => {
    setSavingArea(true);
    try {
      if (notificationsEnabled) {
        await updatePushPreferences(area);
      }
      onNotificationAreaChange(area);
      setFeedback(message);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Der Benachrichtigungsradius konnte nicht gespeichert werden.",
      );
    } finally {
      setSavingArea(false);
    }
  };

  const useLocationForNotifications = async () => {
    try {
      const point =
        location.state.status === "ready" && !notificationArea
          ? location.state.point
          : await location.request();
      const center: [number, number] = [
        Number(point[0].toFixed(5)),
        Number(point[1].toFixed(5)),
      ];
      await saveArea(
        { center, radiusKm },
        notificationsEnabled
          ? `Benachrichtigungsradius von ${radiusKm} km ist gespeichert.`
          : `Standort und Radius von ${radiusKm} km sind vorgemerkt.`,
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Der Standort konnte nicht bestimmt werden.",
      );
    }
  };

  const saveRadius = async () => {
    if (!notificationArea) {
      setFeedback("Legen Sie zuerst den Mittelpunkt über Ihren Standort fest.");
      return;
    }
    await saveArea(
      { ...notificationArea, radiusKm },
      `Benachrichtigungsradius auf ${radiusKm} km aktualisiert.`,
    );
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) return;
    if (!notificationArea) {
      setFeedback(
        "Legen Sie zuerst Standort und Radius für Benachrichtigungen fest.",
      );
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationState(permission);
      if (permission !== "granted") {
        setFeedback("Benachrichtigungen wurden nicht freigegeben.");
        return;
      }
      await subscribeToPush(notificationArea);
      localStorage.setItem(NOTIFICATIONS_KEY, "true");
      setNotificationsEnabled(true);
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Benachrichtigungen aktiviert", {
        body: `Sie erhalten Hinweise zu neuen Baustellen im Umkreis von ${notificationArea.radiusKm} km.`,
        icon: `${import.meta.env.BASE_URL}icons/faecherbagger-192.png`,
        badge: `${import.meta.env.BASE_URL}icons/faecherbagger-192.png`,
        tag: "faecherbagger-test",
      });
      setFeedback("Testbenachrichtigung wurde gesendet.");
    } catch (error) {
      localStorage.setItem(NOTIFICATIONS_KEY, "false");
      setNotificationsEnabled(false);
      setFeedback(
        error instanceof Error
          ? error.message
          : "Benachrichtigungen konnten nicht aktiviert werden.",
      );
    }
  };

  const disableNotifications = async () => {
    try {
      await unsubscribeFromPush();
      localStorage.setItem(NOTIFICATIONS_KEY, "false");
      setNotificationsEnabled(false);
      setFeedback("Baustellenbenachrichtigungen sind ausgeschaltet.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Benachrichtigungen konnten nicht ausgeschaltet werden.",
      );
    }
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(undefined);
  };

  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const canOfferNotifications = !isiOS || installed;

  return (
    <section className="pwa-panel" aria-labelledby="pwa-heading">
      <div>
        <KernHeading level={2} id="pwa-heading">
          App und Benachrichtigungen
        </KernHeading>
        <KernText>
          Installieren Sie Fächerbagger für schnellen Zugriff und aktuelle
          Baustellendaten – auch bei einer schlechten Verbindung.
        </KernText>
      </div>

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
            disabled={savingArea || location.state.status === "requesting"}
            onClick={() => void useLocationForNotifications()}
          />
          {notificationArea && radiusKm !== notificationArea.radiusKm && (
            <KernButton
              type="button"
              variant="tertiary"
              label="Radius speichern"
              disabled={savingArea}
              onClick={() => void saveRadius()}
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
        {!installed && installPrompt && (
          <KernButton
            type="button"
            label="App installieren"
            onClick={() => void install()}
          />
        )}
        {!notificationsEnabled &&
          notificationState !== "unsupported" &&
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
        {notificationsEnabled && (
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
            sendToWorker({ type: "REFRESH_DATA" });
            setFeedback("Aktualisierung wurde angefordert.");
          }}
        />
      </div>

      {!installed && !installPrompt && isiOS && (
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
      {notificationsEnabled && !notificationArea && (
        <KernAlert variant="warning" title="Benachrichtigungsgebiet fehlt">
          <KernText>
            Legen Sie einen Standort und Radius fest, damit nur passende neue
            Baustellen gemeldet werden.
          </KernText>
        </KernAlert>
      )}
      {notificationState === "denied" && (
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
      {feedback && (
        <KernText className="pwa-panel__feedback" aria-live="polite">
          {feedback}
        </KernText>
      )}
    </section>
  );
}
