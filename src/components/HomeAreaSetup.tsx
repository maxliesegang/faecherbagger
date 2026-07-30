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
  roundHomeAreaCenter,
} from "../shared/home-area.ts";
import { getConstructionSiteMunicipalityOptions } from "../lib/construction-site-filter.ts";
import { getMunicipalityCenter } from "../lib/municipality-center.ts";
import "./HomeAreaSetup.css";

/**
 * Defines what gets reported: a center — from the device location or, as a
 * fallback, from a municipality in the data — and how far around it to watch.
 *
 * Rendered in the notification section only, because the distance is what a
 * notification is about: "melde mir neue Baustellen bis 5 km" is one sentence
 * and belongs in one panel. The surroundings screen reads the same area to
 * scope its lists and links here instead of carrying a second copy of these
 * controls; two editors for one value is how the two screens came to disagree
 * about it. This panel reports what happened to the *area*; what happened to
 * the subscription is reported by the card that owns the switch.
 *
 * The slider is a draft until it is saved, because saving re-syncs the push
 * subscription — a value that leaves the device should not move under a thumb.
 */
export function HomeAreaSetup() {
  const { constructionSites } = useDataset();
  const {
    area: homeArea,
    setArea: onHomeAreaChange,
    clearArea: onHomeAreaClear,
    location: locationController,
  } = usePersonal();

  const [municipality, setMunicipality] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<string>();
  const municipalities = useMemo(
    () => getConstructionSiteMunicipalityOptions(constructionSites),
    [constructionSites],
  );

  // The draft radius, and the saved value it was taken from. Comparing the two
  // during render is what lets the slider follow an area that was saved or
  // cleared elsewhere without an effect that would first paint a stale number.
  const savedRadiusKm = homeArea?.radiusKm ?? DEFAULT_HOME_AREA_RADIUS_KM;
  const [radiusKm, setRadiusKm] = useState(savedRadiusKm);
  const [lastSavedRadiusKm, setLastSavedRadiusKm] = useState(savedRadiusKm);
  if (lastSavedRadiusKm !== savedRadiusKm) {
    setLastSavedRadiusKm(savedRadiusKm);
    setRadiusKm(savedRadiusKm);
  }

  const isRequestingLocation =
    locationController.locationState.status === "requesting";
  const hasUnsavedRadius = homeArea !== null && homeArea.radiusKm !== radiusKm;

  const useCurrentLocationAsCenter = async () => {
    try {
      const point = await locationController.requestLocation();
      onHomeAreaChange({
        center: roundHomeAreaCenter(point),
        radiusKm,
      });
      setFeedbackMessage(`Gespeichert: ${radiusKm} km um Ihren Standort.`);
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
        <legend>Entfernung</legend>
        <label htmlFor="area-radius" className="area-setup__radius-label">
          Melden bis
          <output htmlFor="area-radius" className="area-setup__radius-value">
            {radiusKm} km
          </output>
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
