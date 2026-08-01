import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import {
  KernAlert,
  KernButton,
  KernInput,
  KernLoader,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type {
  LngLat,
  NotificationArea,
  NotificationEventKind,
  NotificationPreferences,
  NotificationSeverityThreshold,
} from "../types/index.ts";
import {
  createNotificationAreaId,
  upsertNotificationArea,
} from "../lib/notification-area.ts";
import {
  DEFAULT_NOTIFICATION_RADIUS_KM,
  MAX_NOTIFICATION_AREA_LABEL_LENGTH,
  MAX_NOTIFICATION_RADIUS_KM,
  MIN_NOTIFICATION_RADIUS_KM,
} from "../lib/notification-preferences.ts";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";
import "./NotificationSetupDialog.css";

const NotificationAreaPickerMap = lazy(() =>
  import("./NotificationAreaPickerMap.tsx").then((module) => ({
    default: module.NotificationAreaPickerMap,
  })),
);

/** Karlsruhe's Marktplatz — a sensible first guess for the region. */
const FALLBACK_CENTER: LngLat = [8.4044, 49.0094];

const STEPS = ["Wo?", "Wie weit?", "Worüber?"] as const;
const LAST_STEP = STEPS.length - 1;

const KIND_OPTIONS: readonly {
  value: NotificationEventKind;
  label: string;
  hint: string;
}[] = [
  {
    value: "new",
    label: "Neu angekündigt",
    hint: "Sobald eine Baustelle in Ihrem Gebiet erstmals gemeldet wird.",
  },
  {
    value: "starts-soon",
    label: "Beginnt bald",
    hint: "Erinnerung eine Woche und einen Tag vor dem Baustart.",
  },
  {
    value: "changed",
    label: "Zeitraum oder Sperrung geändert",
    hint: "Wenn sich Dauer oder Verkehrsauswirkung einer Baustelle ändert.",
  },
];

const SEVERITY_OPTIONS: readonly {
  value: NotificationSeverityThreshold;
  label: string;
  hint: string;
}[] = [
  {
    value: "all",
    label: "Alles",
    hint: "Auch Arbeiten ohne Auswirkung auf den Verkehr.",
  },
  {
    value: "obstruction",
    label: "Ab Behinderung",
    hint: "Alles, was den Verkehr spürbar einschränkt.",
  },
  {
    value: "closure",
    label: "Nur Sperrungen",
    hint: "Nur Vollsperrungen und gesperrte Fahrtrichtungen.",
  },
];

interface NotificationSetupDialogProps {
  preferences: NotificationPreferences;
  onPreferencesChange: (preferences: NotificationPreferences) => void;
  /** The area being edited; a new one when `undefined`. */
  editedArea?: NotificationArea;
  locationController: CurrentLocationController;
  onClose: () => void;
  /** Called once the visitor finishes the flow and the area has been saved. */
  onComplete: () => void;
}

/**
 * Guided setup for a notification area.
 *
 * Replaces a panel of four buttons whose order was only discoverable by getting
 * it wrong: the three questions that actually have to be answered — where, how
 * far, about what — are asked one at a time, each with the map showing what the
 * answer means.
 */
export function NotificationSetupDialog({
  preferences,
  onPreferencesChange,
  editedArea,
  locationController,
  onClose,
  onComplete,
}: NotificationSetupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [step, setStep] = useState(0);
  const [center, setCenter] = useState<LngLat>(
    editedArea?.center ??
      (locationController.locationState.status === "ready"
        ? locationController.locationState.point
        : FALLBACK_CENTER),
  );
  const [radiusKm, setRadiusKm] = useState(
    editedArea?.radiusKm ?? DEFAULT_NOTIFICATION_RADIUS_KM,
  );
  const [label, setLabel] = useState(editedArea?.label ?? "");
  const [kinds, setKinds] = useState<NotificationEventKind[]>([
    ...preferences.kinds,
  ]);
  const [minSeverity, setMinSeverity] = useState(preferences.minSeverity);
  const [locationError, setLocationError] = useState<string>();

  // `showModal` rather than the `open` attribute: only the modal form makes the
  // browser trap focus, handle Escape and render the backdrop for us.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog?.isConnected || dialog.open) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const useCurrentLocationAsCenter = async () => {
    setLocationError(undefined);
    try {
      setCenter(await locationController.requestLocation());
    } catch (error) {
      setLocationError(
        error instanceof Error
          ? error.message
          : "Der Standort konnte nicht bestimmt werden.",
      );
    }
  };

  const toggleKind = (kind: NotificationEventKind) =>
    setKinds((current) =>
      current.includes(kind)
        ? current.filter((candidate) => candidate !== kind)
        : [...current, kind],
    );

  const complete = () => {
    const area: NotificationArea = {
      id: editedArea?.id ?? createNotificationAreaId(),
      label: label.trim() || "Mein Gebiet",
      center: [
        Number(center[0].toFixed(5)),
        Number(center[1].toFixed(5)),
      ],
      radiusKm,
    };
    const updated: NotificationPreferences = {
      areas: upsertNotificationArea(preferences.areas, area),
      // An empty selection would mean "never notify me", which is what closing
      // the dialog is for; fall back to the one thing everyone expects.
      kinds: kinds.length > 0 ? kinds : ["new"],
      minSeverity,
    };
    onPreferencesChange(updated);
    onComplete();
  };

  const isLastStep = step === LAST_STEP;
  const canContinue = !isLastStep || kinds.length > 0;

  return (
    <dialog
      ref={dialogRef}
      className="notification-setup"
      aria-labelledby={headingId}
      /*
        `cancel` (Escape, platform dismissal) rather than `close`: `close` also
        fires for the `close()` in this component's effect cleanup, which would
        call back into the parent and unmount the dialog the moment it opened.
        `preventDefault` leaves the closing to the state change instead.
      */
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="notification-setup__header">
        <div>
          <p className="notification-setup__step-count">
            Schritt {step + 1} von {STEPS.length}
          </p>
          <h2 id={headingId}>{STEPS[step]}</h2>
        </div>
        <button
          type="button"
          className="notification-setup__close"
          aria-label="Schließen"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <ol className="notification-setup__progress" aria-hidden="true">
        {STEPS.map((title, index) => (
          <li key={title} data-state={index <= step ? "done" : "todo"} />
        ))}
      </ol>

      <div className="notification-setup__body">
        {step === 0 && (
          <>
            <KernText>
              Tippen Sie auf der Karte die Stelle an, um die es gehen soll —
              zum Beispiel Ihre Wohnadresse. Sie muss nicht Ihr aktueller
              Standort sein.
            </KernText>
            <KernButton
              type="button"
              variant="secondary"
              label={
                locationController.locationState.status === "requesting"
                  ? "Standort wird ermittelt …"
                  : "Meinen aktuellen Standort verwenden"
              }
              disabled={
                locationController.locationState.status === "requesting"
              }
              onClick={() => void useCurrentLocationAsCenter()}
            />
            {locationError && (
              <KernAlert variant="warning" title="Standort nicht verfügbar">
                {locationError}
              </KernAlert>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <KernText>
              Wie weit um diesen Punkt herum möchten Sie informiert werden? Der
              Kreis auf der Karte zeigt das Gebiet.
            </KernText>
            <div className="notification-setup__radius">
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
                aria-valuetext={`${radiusKm} Kilometer`}
                onChange={(event) =>
                  setRadiusKm(Number(event.currentTarget.value))
                }
              />
              <p className="notification-setup__radius-scale" aria-hidden="true">
                <span>{MIN_NOTIFICATION_RADIUS_KM} km</span>
                <span>{MAX_NOTIFICATION_RADIUS_KM} km</span>
              </p>
            </div>
            <KernInput
              id="notification-area-label"
              label="Name für dieses Gebiet"
              hint="Zum Beispiel „Zuhause“ oder „Arbeit“"
              maxLength={MAX_NOTIFICATION_AREA_LABEL_LENGTH}
              value={label}
              onChange={(event) => setLabel(event.currentTarget.value)}
            />
          </>
        )}

        {step === 2 && (
          <>
            <fieldset className="notification-setup__choices">
              <legend>Worüber möchten Sie informiert werden?</legend>
              {KIND_OPTIONS.map((option) => (
                <label key={option.value} className="notification-setup__choice">
                  <input
                    type="checkbox"
                    checked={kinds.includes(option.value)}
                    onChange={() => toggleKind(option.value)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <span className="notification-setup__choice-hint">
                      {option.hint}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset className="notification-setup__choices">
              <legend>Ab welcher Auswirkung?</legend>
              {SEVERITY_OPTIONS.map((option) => (
                <label key={option.value} className="notification-setup__choice">
                  <input
                    type="radio"
                    name="notification-severity"
                    checked={minSeverity === option.value}
                    onChange={() => setMinSeverity(option.value)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <span className="notification-setup__choice-hint">
                      {option.hint}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            {kinds.length === 0 && (
              <KernAlert variant="warning" title="Nichts ausgewählt">
                Wählen Sie mindestens einen Anlass, sonst gibt es nichts zu
                  melden.
              </KernAlert>
            )}
          </>
        )}
      </div>

      {/*
        The map stays mounted across all three steps: it is the only thing that
        makes "5 km" concrete, and remounting it would refetch tiles each time.
      */}
      <Suspense
        fallback={
          <div className="notification-setup__map-fallback">
            <KernLoader />
          </div>
        }
      >
        <NotificationAreaPickerMap
          center={center}
          radiusKm={radiusKm}
          onCenterChange={setCenter}
        />
      </Suspense>

      <div className="notification-setup__actions">
        {step > 0 ? (
          <KernButton
            type="button"
            variant="tertiary"
            label="Zurück"
            onClick={() => setStep((current) => current - 1)}
          />
        ) : (
          <KernButton
            type="button"
            variant="tertiary"
            label="Abbrechen"
            onClick={onClose}
          />
        )}
        <KernButton
          type="button"
          label={isLastStep ? "Gebiet speichern" : "Weiter"}
          disabled={!canContinue}
          onClick={() =>
            isLastStep ? complete() : setStep((current) => current + 1)
          }
        />
      </div>
    </dialog>
  );
}
