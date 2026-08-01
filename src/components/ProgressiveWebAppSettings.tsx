import { useCallback, useEffect, useState } from "react";
import {
  KernAlert,
  KernButton,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import {
  getServerSubscriptionState,
  isPushConfigured,
  isPushSupported,
  sendTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
} from "../lib/push.ts";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";
import type {
  NotificationArea,
  NotificationPreferences,
} from "../types/index.ts";
import { removeNotificationArea } from "../lib/notification-area.ts";
import { MAX_NOTIFICATION_AREAS } from "../lib/notification-preferences.ts";
import { NotificationSetupDialog } from "./NotificationSetupDialog.tsx";
import "./ProgressiveWebAppSettings.css";

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
 * concerned. `unknown` is the honest state before the check completes — the
 * panel must not claim "aktiv" on the strength of a local flag.
 */
type SubscriptionState = "unknown" | "registered" | "inactive";

interface ProgressiveWebAppSettingsProps {
  locationController: CurrentLocationController;
  preferences: NotificationPreferences;
  onPreferencesChange: (preferences: NotificationPreferences) => void;
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
  preferences,
  onPreferencesChange,
}: ProgressiveWebAppSettingsProps) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent>();
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches,
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("Notification" in window ? Notification.permission : "unsupported");
  const [subscriptionState, setSubscriptionState] =
    useState<SubscriptionState>("unknown");
  const [feedbackMessage, setFeedbackMessage] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const [editedArea, setEditedArea] = useState<NotificationArea>();
  const [isSetupOpen, setIsSetupOpen] = useState(false);

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

  const runAction = async (action: () => Promise<void>, fallback: string) => {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      setFeedbackMessage(getErrorMessage(error, fallback));
    } finally {
      setIsBusy(false);
    }
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== "granted") {
      setFeedbackMessage("Benachrichtigungen wurden nicht freigegeben.");
      return;
    }
    await subscribeToPush();
    await refreshSubscriptionState();
    setFeedbackMessage(
      "Benachrichtigungen sind aktiv. Prüfen Sie die Zustellung mit „Testbenachrichtigung senden“.",
    );
  };

  const disableNotifications = async () => {
    await unsubscribeFromPush();
    setSubscriptionState("inactive");
    setFeedbackMessage("Baustellenbenachrichtigungen sind ausgeschaltet.");
  };

  const promptAppInstallation = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(undefined);
  };

  const openSetup = (area?: NotificationArea) => {
    setEditedArea(area);
    setIsSetupOpen(true);
  };

  const closeSetup = () => {
    setIsSetupOpen(false);
    setEditedArea(undefined);
  };

  const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const canOfferNotifications = !isIosDevice || isInstalled;
  const isActive = subscriptionState === "registered";
  const canAddArea = preferences.areas.length < MAX_NOTIFICATION_AREAS;

  return (
    <section className="pwa-panel" aria-labelledby="pwa-panel-heading">
      <div className="pwa-panel__heading">
        <h2 id="pwa-panel-heading" className="kern-title">
          Benachrichtigungen
        </h2>
        <span className="pwa-panel__state" data-state={subscriptionState}>
          {subscriptionState === "unknown"
            ? "wird geprüft …"
            : isActive
              ? "aktiv"
              : "aus"}
        </span>
      </div>

      <KernText muted className="pwa-panel__intro">
        Lassen Sie sich melden, was sich an den Straßen tut, die Sie täglich
        benutzen.
      </KernText>

      {preferences.areas.length === 0 ? (
        <KernButton
          type="button"
          label="Gebiet festlegen"
          disabled={isBusy}
          onClick={() => openSetup()}
        />
      ) : (
        <>
          <ul className="pwa-panel__areas">
            {preferences.areas.map((area) => (
              <li key={area.id}>
                <span className="pwa-panel__area-name">
                  <strong>{area.label}</strong>
                  <span>{area.radiusKm} km Umkreis</span>
                </span>
                <span className="pwa-panel__area-actions">
                  <button type="button" onClick={() => openSetup(area)}>
                    Ändern
                    <span className="kern-sr-only"> — {area.label}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onPreferencesChange({
                        ...preferences,
                        areas: removeNotificationArea(
                          preferences.areas,
                          area.id,
                        ),
                      })
                    }
                  >
                    Entfernen
                    <span className="kern-sr-only"> — {area.label}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {canAddArea && (
            <KernButton
              type="button"
              variant="tertiary"
              label="Weiteres Gebiet"
              onClick={() => openSetup()}
            />
          )}
        </>
      )}

      <div className="pwa-panel__actions">
        {!isActive &&
          preferences.areas.length > 0 &&
          notificationPermission !== "unsupported" &&
          canOfferNotifications &&
          isPushSupported &&
          isPushConfigured && (
            <KernButton
              type="button"
              label="Benachrichtigungen einschalten"
              disabled={isBusy}
              onClick={() =>
                void runAction(
                  enableNotifications,
                  "Benachrichtigungen konnten nicht aktiviert werden.",
                )
              }
            />
          )}
        {isActive && (
          <>
            <KernButton
              type="button"
              variant="secondary"
              label="Testbenachrichtigung senden"
              disabled={isBusy}
              onClick={() =>
                void runAction(async () => {
                  await sendTestNotification();
                  setFeedbackMessage(
                    "Testbenachrichtigung ist unterwegs. Sie sollte gleich erscheinen.",
                  );
                }, "Die Testbenachrichtigung konnte nicht gesendet werden.")
              }
            />
            <KernButton
              type="button"
              variant="tertiary"
              label="Ausschalten"
              disabled={isBusy}
              onClick={() =>
                void runAction(
                  disableNotifications,
                  "Benachrichtigungen konnten nicht ausgeschaltet werden.",
                )
              }
            />
          </>
        )}
        {!isInstalled && installPrompt && (
          <KernButton
            type="button"
            variant="tertiary"
            label="App installieren"
            onClick={() => void promptAppInstallation()}
          />
        )}
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
          werden. Gebiete lassen sich bereits festlegen; sie werden auf der
          Karte angezeigt.
        </KernText>
      )}
      {isPushConfigured && (
        <KernText muted className="pwa-panel__hint">
          Beim Einschalten wird eine anonyme Geräteadresse beim
          Benachrichtigungsdienst gespeichert. Gebiete und Auswahl werden nur
          zur Auswahl passender Meldungen verwendet. Beim Ausschalten wird alles
          davon gelöscht.
        </KernText>
      )}
      {notificationPermission === "denied" && (
        <KernAlert variant="warning" title="Benachrichtigungen sind blockiert">
          Geben Sie Benachrichtigungen in den Website- oder App-Einstellungen
            Ihres Geräts frei.
        </KernAlert>
      )}
      {feedbackMessage && (
        <KernText className="pwa-panel__feedback" role="status">
          {feedbackMessage}
        </KernText>
      )}

      <KernButton
        type="button"
        variant="tertiary"
        label="Daten jetzt aktualisieren"
        onClick={() => {
          postMessageToServiceWorker({ type: "REFRESH_DATA" });
          setFeedbackMessage("Aktualisierung wurde angefordert.");
        }}
      />

      {isSetupOpen && (
        <NotificationSetupDialog
          preferences={preferences}
          editedArea={editedArea}
          locationController={locationController}
          onPreferencesChange={onPreferencesChange}
          onClose={closeSetup}
          onComplete={() => {
            closeSetup();
            // The areas are already saved on the device by the dialog. All that
            // can be left to do is register for the wake-up push; finishing the
            // flow is the moment the intent is unambiguous, so this is where
            // the permission prompt belongs.
            if (isActive) {
              setFeedbackMessage("Ihr Gebiet wurde gespeichert.");
              return;
            }
            if (
              isPushSupported &&
              isPushConfigured &&
              canOfferNotifications &&
              notificationPermission !== "denied"
            ) {
              void runAction(
                enableNotifications,
                "Benachrichtigungen konnten nicht aktiviert werden.",
              );
            }
          }}
        />
      )}
    </section>
  );
}
