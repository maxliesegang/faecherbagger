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
import "./HomeAreaSetup.css";

/**
 * Defines the area the app watches: a center — from the device location or,
 * as a fallback, from a municipality in the data — and a radius.
 *
 * The switch for notifications about this area lives next to this panel in
 * {@link NotificationSettings} rather than inside it: it is the same decision
 * for the visitor, but it needs an area to exist first, and this panel is also
 * shown during onboarding, where there is none yet. This panel reports what
 * happened to the *area*; what happened to the subscription is reported by the
 * card that owns the switch.
 */
export function HomeAreaSetup() {
  const { constructionSites } = useDataset();
  const {
    area: homeArea,
    setArea: onHomeAreaChange,
    clearArea: onHomeAreaClear,
    location: locationController,
  } = usePersonal();

  const [radiusKm, setRadiusKm] = useState(
    homeArea?.radiusKm ?? DEFAULT_HOME_AREA_RADIUS_KM,
  );
  const [municipality, setMunicipality] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<string>();
  const municipalities = useMemo(
    () => getConstructionSiteMunicipalityOptions(constructionSites),
    [constructionSites],
  );

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

      {feedbackMessage && (
        <KernText className="area-setup__feedback" aria-live="polite">
          {feedbackMessage}
        </KernText>
      )}
    </div>
  );
}
