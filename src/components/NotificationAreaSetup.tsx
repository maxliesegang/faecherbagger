import { useMemo, useState } from "react";
import {
  KernAlert,
  KernButton,
  KernSelect,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type { ConstructionSite, NotificationArea } from "../types/index.ts";
import {
  DEFAULT_NOTIFICATION_RADIUS_KM,
  MAX_NOTIFICATION_RADIUS_KM,
  MIN_NOTIFICATION_RADIUS_KM,
} from "../lib/notification-area.ts";
import { roundNotificationCenter } from "../lib/notification-area.ts";
import { getConstructionSiteMunicipalityOptions } from "../lib/construction-site-filter.ts";
import { getMunicipalityCenter } from "../lib/municipality-center.ts";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";
import {
  canOfferPushNotifications,
  type PushNotificationController,
} from "../hooks/usePushNotifications.ts";
import { isIosDevice } from "../hooks/useProgressiveWebApp.ts";
import "./NotificationAreaSetup.css";

interface NotificationAreaSetupProps {
  /** Source for the municipality fallback when no device location is shared. */
  constructionSites: readonly ConstructionSite[];
  notificationArea: NotificationArea | null;
  onNotificationAreaChange: (area: NotificationArea) => void;
  onNotificationAreaClear: () => void;
  locationController: CurrentLocationController;
  pushController: PushNotificationController;
  /** iOS only exposes Web Push to an installed app. */
  isInstalled: boolean;
}

/**
 * Defines the area the app watches: a center — from the device location or,
 * as a fallback, from a municipality in the data — and a radius. The same panel
 * switches the notifications for that area on and off, because for the visitor
 * these are one decision ("melde mir Baustellen hier").
 */
export function NotificationAreaSetup({
  constructionSites,
  notificationArea,
  onNotificationAreaChange,
  onNotificationAreaClear,
  locationController,
  pushController,
  isInstalled,
}: NotificationAreaSetupProps) {
  const [radiusKm, setRadiusKm] = useState(
    notificationArea?.radiusKm ?? DEFAULT_NOTIFICATION_RADIUS_KM,
  );
  const [municipality, setMunicipality] = useState("");
  const municipalities = useMemo(
    () => getConstructionSiteMunicipalityOptions(constructionSites),
    [constructionSites],
  );

  const { setFeedbackMessage } = pushController;
  const isRequestingLocation =
    locationController.locationState.status === "requesting";
  const hasUnsavedRadius =
    notificationArea !== null && notificationArea.radiusKm !== radiusKm;

  const useCurrentLocationAsCenter = async () => {
    try {
      const point = await locationController.requestLocation();
      onNotificationAreaChange({
        center: roundNotificationCenter(point),
        radiusKm,
      });
      setFeedbackMessage(
        `Gebiet gespeichert: ${radiusKm} km um Ihren Standort.`,
      );
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error
          ? error.message
          : "Der Standort konnte nicht bestimmt werden.",
      );
    }
  };

  const useMunicipalityAsCenter = () => {
    const center = municipality
      ? getMunicipalityCenter(constructionSites, municipality)
      : undefined;
    if (!center) {
      setFeedbackMessage("Bitte wählen Sie zuerst einen Ort aus.");
      return;
    }
    onNotificationAreaChange({ center, radiusKm });
    setFeedbackMessage(`Gebiet gespeichert: ${radiusKm} km um ${municipality}.`);
  };

  const saveRadius = () => {
    if (!notificationArea) return;
    onNotificationAreaChange({ ...notificationArea, radiusKm });
    setFeedbackMessage(`Radius auf ${radiusKm} km geändert.`);
  };

  const removeArea = () => {
    onNotificationAreaClear();
    setFeedbackMessage("Das Gebiet wurde entfernt.");
  };

  const toggleNotifications = () => {
    if (pushController.isEnabled) {
      void pushController.disableNotifications();
      return;
    }
    if (!notificationArea) {
      setFeedbackMessage("Legen Sie zuerst Mittelpunkt und Radius fest.");
      return;
    }
    void pushController.enableNotifications(notificationArea);
  };

  const canOfferNotifications = canOfferPushNotifications(
    pushController.status,
    isInstalled,
  );

  return (
    <div className="area-setup">
      <fieldset className="area-setup__field">
        <legend>Mittelpunkt</legend>
        <KernText muted className="area-setup__hint">
          Ihr genauer Standort bleibt auf diesem Gerät: Der Mittelpunkt wird auf
          etwa 100 m gerundet. Für Benachrichtigungen werden nur dieser
          gerundete Mittelpunkt und der Radius übertragen.
        </KernText>
        <div className="area-setup__actions">
          <KernButton
            type="button"
            variant={notificationArea ? "secondary" : "primary"}
            label={
              isRequestingLocation
                ? "Standort wird ermittelt …"
                : notificationArea
                  ? "Standort neu bestimmen"
                  : "Meinen Standort verwenden"
            }
            disabled={isRequestingLocation}
            onClick={() => void useCurrentLocationAsCenter()}
          />
        </div>

        <div className="area-setup__municipality">
          <KernSelect
            id="area-municipality"
            label="Oder einen Ort wählen"
            value={municipality}
            onChange={(event) => setMunicipality(event.currentTarget.value)}
          >
            <option value="">Ort auswählen</option>
            {municipalities.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </KernSelect>
          <KernButton
            type="button"
            variant="tertiary"
            label="Ort übernehmen"
            disabled={!municipality}
            onClick={useMunicipalityAsCenter}
          />
        </div>
      </fieldset>

      <fieldset className="area-setup__field">
        <legend>Radius</legend>
        <label htmlFor="area-radius" className="area-setup__radius-label">
          Umkreis: <strong>{radiusKm} km</strong>
        </label>
        <input
          id="area-radius"
          type="range"
          className="area-setup__radius"
          min={MIN_NOTIFICATION_RADIUS_KM}
          max={MAX_NOTIFICATION_RADIUS_KM}
          step="1"
          value={radiusKm}
          onChange={(event) => setRadiusKm(Number(event.currentTarget.value))}
        />
        {hasUnsavedRadius && (
          <div className="area-setup__actions">
            <KernButton
              type="button"
              variant="secondary"
              label={`Radius auf ${radiusKm} km übernehmen`}
              onClick={saveRadius}
            />
          </div>
        )}
      </fieldset>

      <fieldset className="area-setup__field">
        <legend>Benachrichtigungen</legend>
        {canOfferNotifications ? (
          <>
            <KernText muted className="area-setup__hint">
              {pushController.isEnabled
                ? "Dieses Gerät erhält eine Meldung, sobald eine neue Baustelle in Ihrem Gebiet auftaucht."
                : "Lassen Sie sich melden, sobald eine neue Baustelle in Ihrem Gebiet auftaucht."}
            </KernText>
            <div className="area-setup__actions">
              <KernButton
                type="button"
                variant={pushController.isEnabled ? "tertiary" : "primary"}
                label={
                  pushController.isEnabled
                    ? "Benachrichtigungen ausschalten"
                    : "Benachrichtigungen einschalten"
                }
                disabled={pushController.isBusy}
                onClick={toggleNotifications}
              />
            </div>
          </>
        ) : (
          <KernText muted className="area-setup__hint">
            {pushController.status === "blocked"
              ? "Benachrichtigungen sind für diese Seite blockiert. Geben Sie sie in den Einstellungen Ihres Geräts frei."
              : pushController.status === "unconfigured"
                ? "Der Benachrichtigungsdienst ist für diese Bereitstellung noch nicht konfiguriert. Die Übersicht funktioniert trotzdem."
                : isIosDevice
                  ? "Auf iPhone und iPad: in Safari „Teilen“ und dann „Zum Home-Bildschirm“ wählen. Danach sind Benachrichtigungen verfügbar."
                  : "Dieser Browser unterstützt keine Benachrichtigungen. Die Übersicht funktioniert trotzdem."}
          </KernText>
        )}
      </fieldset>

      {notificationArea && (
        <div className="area-setup__actions area-setup__actions--footer">
          <KernButton
            type="button"
            variant="tertiary"
            label="Gebiet entfernen"
            onClick={removeArea}
          />
        </div>
      )}

      {locationController.locationState.status === "error" && (
        <KernAlert variant="warning" title="Standort nicht verfügbar">
          <KernText>{locationController.locationState.message}</KernText>
        </KernAlert>
      )}

      {pushController.feedbackMessage && (
        <KernText className="area-setup__feedback" aria-live="polite">
          {pushController.feedbackMessage}
        </KernText>
      )}
    </div>
  );
}
