import { useState } from "react";
import { KernButton } from "@kern-ux-annex/kern-react-kit";
import type {
  ConstructionSiteMetadata,
  NotificationArea,
  NotificationPreferences,
  NotificationSeverityThreshold,
} from "../types/index.ts";
import type { PushNotificationsController } from "../hooks/usePushNotifications.ts";
import {
  describeNotificationArea,
  removeNotificationArea,
} from "../lib/notification-area.ts";
import { MAX_NOTIFICATION_AREAS } from "../lib/notification-preferences.ts";
import { formatISOTimestamp } from "../lib/construction-site-labels.ts";
import {
  DEFAULT_PUSH_RHYTHM_DAYS,
  PUSH_RHYTHM_DAYS,
  PUSH_RHYTHM_LABELS,
} from "../lib/push-delivery.ts";
import { NotificationSwitch } from "./NotificationSwitch.tsx";
import { InstallAppHint } from "./InstallAppHint.tsx";
import { AppIcon, NOTIFICATION_AREA_ICON } from "./AppIcon.tsx";
import "./SettingsPage.css";

const SEVERITY_OPTIONS: readonly {
  value: NotificationSeverityThreshold;
  label: string;
}[] = [
  { value: "all", label: "Alle Baustellen" },
  { value: "obstruction", label: "Ab Behinderung" },
  { value: "closure", label: "Nur Sperrungen" },
];

type NotificationTimingKey =
  | "notifyEarly"
  | "remindTwoWeeksBefore"
  | "remindDayBefore";

/** In the order they happen; at least one stays on. */
const TIMING_OPTIONS: readonly {
  key: NotificationTimingKey;
  label: string;
  isOnByDefault: boolean;
}[] = [
  { key: "notifyEarly", label: "Sobald angekündigt", isOnByDefault: false },
  { key: "remindTwoWeeksBefore", label: "14 Tage vor Beginn", isOnByDefault: true },
  { key: "remindDayBefore", label: "1 Tag vor Beginn", isOnByDefault: true },
];

const isTimingOn = (
  preferences: NotificationPreferences,
  { key, isOnByDefault }: (typeof TIMING_OPTIONS)[number],
): boolean => preferences[key] ?? isOnByDefault;

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
  // Removing a place drops its distance settings with it, so it asks once.
  const [confirmingAreaId, setConfirmingAreaId] = useState<string>();

  return (
    <div className="settings">
      {/* What the visitor comes here to change. */}
      <div className="settings__column">
        <section className="settings__section" aria-labelledby="settings-areas">
          <h2 id="settings-areas">Ihre Orte</h2>
          {preferences.areas.length === 0 ? (
            <p className="settings__muted">Noch kein Ort festgelegt.</p>
          ) : (
            <ul className="settings__list">
              {preferences.areas.map((area) => (
                <li key={area.id} className="settings__row">
                  <span className="settings__row-main">
                    <AppIcon
                      name={NOTIFICATION_AREA_ICON[area.kind]}
                      className="settings__row-icon"
                    />
                    <span className="settings__row-text">
                      <strong>{area.label}</strong>
                      <span>{describeNotificationArea(area)}</span>
                    </span>
                  </span>
                  {confirmingAreaId === area.id ? (
                    <span
                      className="settings__row-actions"
                      role="group"
                      aria-label={`${area.label} entfernen?`}
                    >
                      <button
                        type="button"
                        className="settings__danger"
                        onClick={() => {
                          setConfirmingAreaId(undefined);
                          onPreferencesChange({
                            ...preferences,
                            areas: removeNotificationArea(preferences.areas, area.id),
                          });
                        }}
                      >
                        Wirklich entfernen
                      </button>
                      {/*
                        The pressed button is gone, so focus moves here: the
                        safe choice, so a second Enter does not delete.
                      */}
                      <button
                        type="button"
                        autoFocus
                        onClick={() => setConfirmingAreaId(undefined)}
                      >
                        Abbrechen
                      </button>
                    </span>
                  ) : (
                    <span className="settings__row-actions">
                      <button type="button" onClick={() => onAreaEdit(area)}>
                        Ändern<span className="kern-sr-only"> – {area.label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingAreaId(area.id)}
                      >
                        Entfernen<span className="kern-sr-only"> – {area.label}</span>
                      </button>
                    </span>
                  )}
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
          {/*
            The options only mean something once notifications are on; until
            then they are noise between the switch and the next section.
          */}
          {pushNotifications.isActive && (
            <div className="settings__options">
              <fieldset className="settings__fieldset">
                <legend>Worüber?</legend>
                <p className="settings__muted">
                  Vorgabe für neue Orte.
                </p>
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
                <p className="settings__muted">
                  Mindestens ein Zeitpunkt bleibt gewählt.
                </p>
                {TIMING_OPTIONS.map((option) => {
                  const isOn = isTimingOn(preferences, option);
                  const isLastOn =
                    isOn &&
                    TIMING_OPTIONS.filter((other) =>
                      isTimingOn(preferences, other),
                    ).length === 1;
                  return (
                    <label key={option.key} className="settings__choice">
                      <input
                        type="checkbox"
                        checked={isOn}
                        disabled={isLastOn}
                        onChange={(event) =>
                          onPreferencesChange({
                            ...preferences,
                            [option.key]: event.currentTarget.checked,
                          })
                        }
                      />
                      {option.label}
                    </label>
                  );
                })}
              </fieldset>
              {pushNotifications.deliveryMode === "planned" && (
                <fieldset className="settings__fieldset">
                  <legend>Wie oft?</legend>
                  <p className="settings__muted">
                    Spätestens nach dieser Zeit kommt eine Nachricht mit allem
                    Neuen. Gibt es nichts, steht dort „Keine neuen Meldungen“.
                    Erinnerungen kommen pünktlich am Termin.
                  </p>
                  {PUSH_RHYTHM_DAYS.map((rhythmDays) => (
                    <label key={rhythmDays} className="settings__choice">
                      <input
                        type="radio"
                        name="settings-push-rhythm"
                        checked={
                          (preferences.pushRhythmDays ??
                            DEFAULT_PUSH_RHYTHM_DAYS) === rhythmDays
                        }
                        onChange={() =>
                          onPreferencesChange({
                            ...preferences,
                            pushRhythmDays: rhythmDays,
                          })
                        }
                      />
                      {PUSH_RHYTHM_LABELS[rhythmDays]}
                    </label>
                  ))}
                </fieldset>
              )}
              <KernButton
                type="button"
                variant="tertiary"
                label="Testnachricht senden"
                disabled={pushNotifications.isBusy}
                onClick={() => void pushNotifications.sendTest()}
              />
            </div>
          )}
          {pushNotifications.isActive && (
            <p className="settings__muted">
              Ihre gespeicherten Orte und Ihre Auswahl werden nicht an den
              Benachrichtigungsdienst übertragen.
            </p>
          )}
        </section>
      </div>

      {/* About the app; beside the main column once there is room. */}
      <div className="settings__column settings__column--secondary">
        <section className="settings__section" aria-labelledby="settings-app">
          <h2 id="settings-app">App</h2>
          {!pushNotifications.isInstalled && (
            <InstallAppHint
              install={pushNotifications.install}
              installPlatform={pushNotifications.installPlatform}
            />
          )}
          <div className="settings__actions">
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
          <h2 id="settings-about">Datenquelle</h2>
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
    </div>
  );
}
