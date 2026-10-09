import { KernButton } from "@kern-ux-annex/kern-react-kit";
import type {
  ConstructionSiteMetadata,
  NotificationArea,
  NotificationPreferences,
  NotificationSeverityThreshold,
} from "../types/index.ts";
import type { PushNotificationsController } from "../hooks/usePushNotifications.ts";
import { removeNotificationArea } from "../lib/notification-area.ts";
import {
  formatNotificationRadius,
  MAX_NOTIFICATION_AREAS,
} from "../lib/notification-preferences.ts";
import { formatISOTimestamp } from "../lib/construction-site-labels.ts";
import { UNOFFICIAL_NOTICE } from "../lib/site-operator.ts";
import { NotificationSwitch } from "./NotificationSwitch.tsx";
import "./SettingsPage.css";

const SEVERITY_OPTIONS: readonly {
  value: NotificationSeverityThreshold;
  label: string;
}[] = [
  { value: "all", label: "Alle Baustellen" },
  { value: "obstruction", label: "Nur mit Behinderung oder Sperrung" },
  { value: "closure", label: "Nur Sperrungen und unklare Fälle" },
];

interface SettingsPageProps {
  preferences: NotificationPreferences;
  onPreferencesChange: (preferences: NotificationPreferences) => void;
  onAreaEdit: (area?: NotificationArea) => void;
  pushNotifications: PushNotificationsController;
  metadata: ConstructionSiteMetadata;
}

/**
 * Everything the visitor sets once and then forgets: places, notifications,
 * the app itself, and where the data comes from. Kept off the other two
 * screens so they can stay about construction sites.
 */
export function SettingsPage({
  preferences,
  onPreferencesChange,
  onAreaEdit,
  pushNotifications,
  metadata,
}: SettingsPageProps) {
  const canAddArea = preferences.areas.length < MAX_NOTIFICATION_AREAS;
  const canConfigureNotifications =
    pushNotifications.unavailableReason !== "unconfigured" &&
    pushNotifications.unavailableReason !== "unsupported";

  return (
    <div className="settings">
      <section className="settings__section" aria-labelledby="settings-areas">
        <h2 id="settings-areas">Ihre Orte</h2>
        {preferences.areas.length === 0 ? (
          <p className="settings__muted">Noch kein Ort festgelegt.</p>
        ) : (
          <ul className="settings__list">
            {preferences.areas.map((area) => (
              <li key={area.id} className="settings__row">
                <span className="settings__row-text">
                  <strong>{area.label}</strong>
                  <span>{formatNotificationRadius(area.radiusKm)} Umkreis</span>
                </span>
                <span className="settings__row-actions">
                  <button type="button" onClick={() => onAreaEdit(area)}>
                    Ändern<span className="kern-sr-only"> – {area.label}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onPreferencesChange({
                        ...preferences,
                        areas: removeNotificationArea(preferences.areas, area.id),
                      })
                    }
                  >
                    Entfernen<span className="kern-sr-only"> – {area.label}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {canAddArea && (
          <KernButton
            type="button"
            variant={preferences.areas.length === 0 ? "primary" : "secondary"}
            label={preferences.areas.length === 0 ? "Ort festlegen" : "Ort hinzufügen"}
            onClick={() => onAreaEdit()}
          />
        )}
        {preferences.followedSiteIds.length > 0 && (
          <p className="settings__muted">
            {preferences.followedSiteIds.length === 1
              ? "Dazu 1 gemerkte Baustelle."
              : `Dazu ${preferences.followedSiteIds.length} gemerkte Baustellen.`}
          </p>
        )}
      </section>

      <section
        className="settings__section"
        aria-labelledby="settings-notifications"
      >
        <h2 id="settings-notifications">Benachrichtigungen</h2>
        <NotificationSwitch pushNotifications={pushNotifications} />
        {canConfigureNotifications && (
          <>
            <fieldset className="settings__fieldset">
              <legend>Worüber?</legend>
              {SEVERITY_OPTIONS.map((option) => (
                <label key={option.value} className="settings__choice">
                  <input
                    type="radio"
                    name="settings-severity"
                    checked={preferences.minSeverity === option.value}
                    onChange={() =>
                      onPreferencesChange({
                        ...preferences,
                        minSeverity: option.value,
                      })
                    }
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <fieldset className="settings__fieldset">
              <legend>Wann?</legend>
              <label className="settings__choice">
                <input
                  type="checkbox"
                  checked={preferences.remindDayBefore !== false}
                  onChange={(event) =>
                    onPreferencesChange({
                      ...preferences,
                      remindDayBefore: event.currentTarget.checked,
                    })
                  }
                />
                Am Tag vor Beginn erinnern
              </label>
              <label className="settings__choice">
                <input
                  type="checkbox"
                  checked={preferences.notifyEarly === true}
                  onChange={(event) =>
                    onPreferencesChange({
                      ...preferences,
                      notifyEarly: event.currentTarget.checked,
                    })
                  }
                />
                Schon bei Ankündigung, nicht erst 14 Tage vorher
              </label>
            </fieldset>
            {pushNotifications.isActive && (
              <KernButton
                type="button"
                variant="tertiary"
                label="Testnachricht senden"
                disabled={pushNotifications.isBusy}
                onClick={() => void pushNotifications.sendTest()}
              />
            )}
          </>
        )}
        <p className="settings__muted">
          Ihre Orte bleiben auf diesem Gerät. Für Benachrichtigungen speichert
          der Server nur eine anonyme Geräteadresse.
        </p>
      </section>

      <section className="settings__section" aria-labelledby="settings-app">
        <h2 id="settings-app">App</h2>
        <div className="settings__actions">
          {!pushNotifications.isInstalled && pushNotifications.install && (
            <KernButton
              type="button"
              variant="secondary"
              label="App installieren"
              onClick={() => void pushNotifications.install?.()}
            />
          )}
          <KernButton
            type="button"
            variant="secondary"
            label="Daten aktualisieren"
            onClick={pushNotifications.refreshData}
          />
        </div>
        <p className="settings__muted">
          Stand der Daten: {formatISOTimestamp(metadata.fetchedAt)}
        </p>
      </section>

      <section className="settings__section" aria-labelledby="settings-about">
        <h2 id="settings-about">Über Fächerbagger</h2>
        <p>{UNOFFICIAL_NOTICE}</p>
        <p className="settings__muted">
          Daten: {metadata.source.name}. Quellen:{" "}
          {metadata.attribution.join(", ")}.
        </p>
        <ul className="settings__links">
          <li>
            <a href="https://mobil.trk.de/">Mobilitätsportal der TRK</a>
          </li>
          <li>
            <a href={`${import.meta.env.BASE_URL}baustellen.xml`}>RSS-Feed</a>
          </li>
          <li>
            <a href={`${import.meta.env.BASE_URL}baustellen.atom`}>Atom-Feed</a>
          </li>
        </ul>
      </section>
    </div>
  );
}
