import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import {
  KernAlert,
  KernButton,
  KernInput,
  KernLoader,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type {
  ConstructionSite,
  LngLat,
  NotificationArea,
  NotificationPreferences,
} from "../types/index.ts";
import {
  createNotificationAreaId,
  upsertNotificationArea,
} from "../lib/notification-area.ts";
import {
  DEFAULT_NOTIFICATION_RADIUS_KM,
  findNearestNotificationRadiusStepIndex,
  formatNotificationRadius,
  MAX_NOTIFICATION_AREA_LABEL_LENGTH,
  NOTIFICATION_RADIUS_STEPS_KM,
} from "../lib/notification-preferences.ts";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";
import type { PushNotificationsController } from "../hooks/usePushNotifications.ts";
import { findAreaMatches } from "../lib/relevant-construction-sites.ts";
import {
  getBerlinCalendarDate,
  getStartLeadDays,
  SHORT_NOTICE_LEAD_DAYS,
} from "../lib/construction-site-timeframe.ts";
import "./NotificationSetupDialog.css";

const NotificationAreaPickerMap = lazy(() =>
  import("./NotificationAreaPickerMap.tsx").then((module) => ({
    default: module.NotificationAreaPickerMap,
  })),
);

/** Karlsruhe's Marktplatz — a sensible first guess for the region. */
const FALLBACK_CENTER: LngLat = [8.4044, 49.0094];

const AREA_STEPS = ["Wo?", "Wie weit?"] as const;
const NOTIFICATION_STEP = "Benachrichtigen?";

interface NotificationSetupDialogProps {
  constructionSites: readonly ConstructionSite[];
  preferences: NotificationPreferences;
  onPreferencesChange: (preferences: NotificationPreferences) => void;
  /** The area being edited; a new one when `undefined`. */
  editedArea?: NotificationArea;
  locationController: CurrentLocationController;
  pushNotifications: PushNotificationsController;
  onClose: () => void;
  /** Called once the visitor finishes the flow and the area has been saved. */
  onComplete: () => void;
}

/**
 * Guided setup for a watched place.
 *
 * Two questions — where, how far — each with the map showing what the answer
 * means, and then, if notifications are still off and could be switched on,
 * a third: whether to be told. That last step is the point of the whole app,
 * so it is asked here rather than left on the settings screen. The finer
 * notification options live there.
 */
export function NotificationSetupDialog({
  constructionSites,
  preferences,
  onPreferencesChange,
  editedArea,
  locationController,
  pushNotifications,
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
  // Decided once on open, so switching notifications on in the last step does
  // not make that step vanish under the visitor's finger.
  const [steps] = useState<readonly string[]>(() =>
    pushNotifications.isActive || pushNotifications.unavailableReason
      ? AREA_STEPS
      : [...AREA_STEPS, NOTIFICATION_STEP],
  );
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
          : "Standort konnte nicht ermittelt werden.",
      );
    }
  };

  const complete = async (shouldEnableNotifications = false) => {
    const area: NotificationArea = {
      id: editedArea?.id ?? createNotificationAreaId(),
      label: label.trim() || "Mein Ort",
      center: [
        Number(center[0].toFixed(5)),
        Number(center[1].toFixed(5)),
      ],
      radiusKm,
    };
    const updated: NotificationPreferences = {
      // Spread first: this dialog owns the areas and must carry everything else
      // (the follow list, the settings screen's options) through untouched.
      ...preferences,
      areas: upsertNotificationArea(preferences.areas, area),
      // No screen offers a choice of kinds; this repairs records saved by
      // older versions that did.
      kinds: ["new", "starts-soon", "changed"],
    };
    onPreferencesChange(updated);
    // Saved before asking: a refused permission must not lose the place.
    if (shouldEnableNotifications) await pushNotifications.enable();
    onComplete();
  };

  const isLastStep = step === steps.length - 1;
  const isNotificationStep = steps[step] === NOTIFICATION_STEP;
  const previewArea: NotificationArea = { id: "preview", label: "Vorschau", center, radiusKm };
  const today = getBerlinCalendarDate();
  const nearbyConstructionSites = constructionSites.filter((constructionSite) => findAreaMatches([previewArea], constructionSite.point).length > 0);
  const startingSoonCount = nearbyConstructionSites.filter((constructionSite) => {
    const leadDays = getStartLeadDays(constructionSite, today);
    return leadDays >= 0 && leadDays <= SHORT_NOTICE_LEAD_DAYS;
  }).length;

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
            Schritt {step + 1} von {steps.length}
          </p>
          <h2 id={headingId}>{steps[step]}</h2>
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
        {steps.map((title, index) => (
          <li key={title} data-state={index <= step ? "done" : "todo"} />
        ))}
      </ol>

      <div className="notification-setup__body">
        {step === 0 && (
          <>
            <KernText>Tippen Sie auf die Karte, z. B. auf Ihre Wohnung.</KernText>
            <KernButton
              type="button"
              variant="secondary"
              label={
                locationController.locationState.status === "requesting"
                  ? "Standort wird ermittelt …"
                  : "Meinen Standort verwenden"
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
            <p role="status" className="notification-setup__preview">
              <strong>{nearbyConstructionSites.length}</strong> Baustellen im
              Umkreis, <strong>{startingSoonCount}</strong> beginnen bald.
            </p>
            <div className="notification-setup__radius">
              <label htmlFor="notification-radius">
                Radius: <strong>{formatNotificationRadius(radiusKm)}</strong>
              </label>
              <input
                id="notification-radius"
                type="range"
                min={0}
                max={NOTIFICATION_RADIUS_STEPS_KM.length - 1}
                step="1"
                value={findNearestNotificationRadiusStepIndex(radiusKm)}
                aria-valuetext={formatNotificationRadius(radiusKm)}
                onChange={(event) =>
                  setRadiusKm(
                    NOTIFICATION_RADIUS_STEPS_KM[
                      Number(event.currentTarget.value)
                    ],
                  )
                }
              />
              <p className="notification-setup__radius-scale" aria-hidden="true">
                <span>{formatNotificationRadius(NOTIFICATION_RADIUS_STEPS_KM[0])}</span>
                <span>
                  {formatNotificationRadius(
                    NOTIFICATION_RADIUS_STEPS_KM[
                      NOTIFICATION_RADIUS_STEPS_KM.length - 1
                    ],
                  )}
                </span>
              </p>
            </div>
          </>
        )}

        {isNotificationStep && (
          <KernText>
            Sollen wir Sie benachrichtigen, wenn im Umkreis eine Baustelle
            angekündigt wird oder sich ändert?
          </KernText>
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

      {/*
        Below the map, so the slider sits right above the circle it resizes;
        the name is a finishing touch, not part of that feedback loop.
      */}
      {step === 1 && (
        <div className="notification-setup__body notification-setup__body--after-map">
          <KernInput
            id="notification-area-label"
            label="Name"
            hint="z. B. „Zuhause“ oder „Arbeit“"
            maxLength={MAX_NOTIFICATION_AREA_LABEL_LENGTH}
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </div>
      )}

      <div className="notification-setup__actions">
        {isNotificationStep ? (
          // The place is decided by now; only the answer is left, so no "Zurück".
          <>
            <KernButton
              type="button"
              variant="secondary"
              label="Später"
              disabled={pushNotifications.isBusy}
              onClick={() => void complete(false)}
            />
            <KernButton
              type="button"
              variant="primary"
              label="Benachrichtigen"
              disabled={pushNotifications.isBusy}
              onClick={() => void complete(true)}
            />
          </>
        ) : (
          <>
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
              variant="primary"
              label={isLastStep ? "Speichern" : "Weiter"}
              onClick={() =>
                isLastStep ? void complete() : setStep((current) => current + 1)
              }
            />
          </>
        )}
      </div>
    </dialog>
  );
}
