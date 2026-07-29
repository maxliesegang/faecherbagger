import { useMemo, useState } from "react";
import {
  KernAlert,
  KernButton,
  KernSelect,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import { useDataset } from "../context/DatasetContext.tsx";
import { usePersonal } from "../context/PersonalContext.tsx";
import {
  DEFAULT_HOME_AREA_RADIUS_KM,
  MAX_HOME_AREA_RADIUS_KM,
  MIN_HOME_AREA_RADIUS_KM,
} from "../shared/home-area.ts";
import { roundHomeAreaCenter } from "../shared/home-area.ts";
import { getConstructionSiteMunicipalityOptions } from "../lib/construction-site-filter.ts";
import { getMunicipalityCenter } from "../lib/municipality-center.ts";
import { canOfferPushNotifications } from "../hooks/usePushNotifications.ts";
import { isIosDevice } from "../hooks/useProgressiveWebApp.ts";
import "./HomeAreaSetup.css";

/**
 * Defines the area the app watches: a center — from the device location or,
 * as a fallback, from a municipality in the data — and a radius. The same panel
 * switches the notifications for that area on and off, because for the visitor
 * these are one decision ("melde mir Baustellen hier").
 */
export function HomeAreaSetup() {
  const { constructionSites } = useDataset();
  const {
    area: homeArea,
    setArea: onHomeAreaChange,
    clearArea: onHomeAreaClear,
    location: locationController,
    push: pushController,
    isInstalled,
  } = usePersonal();

  const [radiusKm, setRadiusKm] = useState(
    homeArea?.radiusKm ?? DEFAULT_HOME_AREA_RADIUS_KM,
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
    homeArea !== null && homeArea.radiusKm !== radiusKm;

  const useCurrentLocationAsCenter = async () => {
    try {
      const point = await locationController.requestLocation();
      onHomeAreaChange({
        center: roundHomeAreaCenter(point),
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
    onHomeAreaChange({ center, radiusKm });
    setFeedbackMessage(`Gebiet gespeichert: ${radiusKm} km um ${municipality}.`);
  };

  const saveRadius = () => {
    if (!homeArea) return;
    onHomeAreaChange({ ...homeArea, radiusKm });
    setFeedbackMessage(`Radius auf ${radiusKm} km geändert.`);
  };

  const removeArea = () => {
    onHomeAreaClear();
    setFeedbackMessage("Das Gebiet wurde entfernt.");
  };

  const toggleNotifications = () => {
    if (pushController.isEnabled) {
      void pushController.disableNotifications();
      return;
    }
    if (!homeArea) {
      setFeedbackMessage("Legen Sie zuerst Mittelpunkt und Radius fest.");
      return;
    }
    void pushController.enableNotifications(homeArea);
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
            variant={homeArea ? "secondary" : "primary"}
            label={
              isRequestingLocation
                ? "Standort wird ermittelt …"
                : homeArea
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
          min={MIN_HOME_AREA_RADIUS_KM}
          max={MAX_HOME_AREA_RADIUS_KM}
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

      {homeArea && (
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
