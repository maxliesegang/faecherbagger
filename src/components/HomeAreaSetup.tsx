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

interface HomeAreaSetupProps {
  /**
   * The radius the visitor is currently dragging, before they commit it. The
   * surroundings screen draws it on the map, so the circle grows under the
   * thumb — that preview is what makes "5 km" mean something. Committing is
   * still explicit, because saving an area re-syncs the push subscription.
   */
  onDraftRadiusChange?: (radiusKm: number) => void;
}

/**
 * Defines the radius the app watches: a center — from the device location or,
 * as a fallback, from a municipality in the data — and how far around it to
 * look.
 *
 * Rendered on the surroundings screen only, which is the screen the radius
 * describes. The notification section states the same radius and links here
 * instead of carrying a second copy of these controls: two editors for one
 * value is how the two screens came to disagree about it. This panel reports
 * what happened to the *area*; what happened to the subscription is reported by
 * the card that owns the switch.
 */
export function HomeAreaSetup({ onDraftRadiusChange }: HomeAreaSetupProps) {
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

  const changeRadius = (nextRadiusKm: number) => {
    setRadiusKm(nextRadiusKm);
    onDraftRadiusChange?.(nextRadiusKm);
  };

  const useCurrentLocationAsCenter = async () => {
    try {
      const point = await locationController.requestLocation();
      onHomeAreaChange({
        center: roundHomeAreaCenter(point),
        radiusKm,
      });
      setFeedbackMessage(
        `Gespeichert: ${radiusKm} km um Ihren Standort.`,
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
    setFeedbackMessage(`Gespeichert: ${radiusKm} km um ${municipality}.`);
  };

  const saveRadius = () => {
    if (!homeArea) return;
    onHomeAreaChange({ ...homeArea, radiusKm });
    setFeedbackMessage(`Umkreis auf ${radiusKm} km geändert.`);
  };

  const removeArea = () => {
    onHomeAreaClear();
    setFeedbackMessage("Der Umkreis wurde entfernt.");
  };

  return (
    <div className="area-setup">
      <fieldset className="area-setup__field">
        <legend>Mittelpunkt</legend>
        <KernText muted className="area-setup__hint">
          Ihr genauer Standort bleibt auf diesem Gerät: gespeichert und — nur für
          Benachrichtigungen — übertragen wird ein auf etwa 100 m gerundeter
          Mittelpunkt.
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
        <legend>Umkreis</legend>
        <label htmlFor="area-radius" className="area-setup__radius-label">
          Baustellen bis <strong>{radiusKm} km</strong> um den Mittelpunkt
        </label>
        <input
          id="area-radius"
          type="range"
          className="area-setup__radius"
          min={MIN_HOME_AREA_RADIUS_KM}
          max={MAX_HOME_AREA_RADIUS_KM}
          step="1"
          value={radiusKm}
          onChange={(event) => changeRadius(Number(event.currentTarget.value))}
        />
        <p className="area-setup__radius-scale" aria-hidden="true">
          <span>{MIN_HOME_AREA_RADIUS_KM} km</span>
          <span>{MAX_HOME_AREA_RADIUS_KM} km</span>
        </p>
        {hasUnsavedRadius && (
          <div className="area-setup__actions">
            <KernButton
              type="button"
              variant="secondary"
              label={`${radiusKm} km übernehmen`}
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
            label="Umkreis entfernen"
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
