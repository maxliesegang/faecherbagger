import { useEffect, useId, useRef, useState } from "react";
import type { LngLat } from "../types/index.ts";
import { AddressSearch } from "./AddressSearch.tsx";

/** A chosen end of a route, with what it was chosen as. */
export interface RouteEndpoint {
  point: LngLat;
  label: string;
}

interface RouteEndpointPickerProps {
  /** "Start" or "Ziel". */
  label: string;
  /** "A" or "B", matching the marker on the map. */
  marker: string;
  value: RouteEndpoint | undefined;
  /** Places already saved, offered as one-tap ends ("Zuhause", "Arbeit"). */
  savedPlaces: readonly RouteEndpoint[];
  /** Resolves the device location, or `undefined` when it cannot be asked for. */
  requestCurrentLocation?: () => Promise<LngLat>;
  /**
   * Shown instead of the choices while this end has to wait for the other:
   * the destination until there is a start. One set of choices at a time
   * keeps the map in view on a phone.
   */
  waitingText?: string;
  onChange: (value: RouteEndpoint | undefined) => void;
}

/**
 * One end of a route.
 *
 * A chosen end is a chip, not a text field holding an address: the chip
 * says what was picked even when it was a map tap, and takes a third of the
 * height on a phone. The most common ends — places already saved, the
 * current location — are one tap; typing an address is there when needed.
 */
export function RouteEndpointPicker({
  label,
  marker,
  value,
  savedPlaces,
  requestCurrentLocation,
  waitingText,
  onChange,
}: RouteEndpointPickerProps) {
  const labelId = useId();
  const [isSearching, setIsSearching] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "error">("idle");
  // Picking, clearing or cancelling unmounts the focused control; focus goes
  // to what replaced it instead of falling back to the top of the dialog.
  const [pendingFocus, setPendingFocus] = useState<"value" | "choices">();
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const choicesRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!pendingFocus) return;
    if (pendingFocus === "value") clearButtonRef.current?.focus();
    else choicesRef.current?.querySelector("button")?.focus();
    setPendingFocus(undefined);
  }, [pendingFocus, value, isSearching]);

  const choose = (endpoint: RouteEndpoint) => {
    setIsSearching(false);
    onChange(endpoint);
    setPendingFocus("value");
  };

  const useCurrentLocation = async () => {
    if (!requestCurrentLocation) return;
    setLocationStatus("requesting");
    try {
      choose({ point: await requestCurrentLocation(), label: "Mein Standort" });
      setLocationStatus("idle");
    } catch {
      setLocationStatus("error");
    }
  };

  return (
    <div className="route-endpoint" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="route-endpoint__label">
        {label}
      </span>
      {value ? (
        <div className="route-endpoint__value">
          <span className="route-endpoint__marker" aria-hidden="true">
            {marker}
          </span>
          <span className="route-endpoint__text">{value.label}</span>
          <button
            ref={clearButtonRef}
            type="button"
            className="route-endpoint__clear"
            aria-label={`${label} entfernen`}
            onClick={() => {
              onChange(undefined);
              setPendingFocus("choices");
            }}
          >
            ×
          </button>
        </div>
      ) : waitingText ? (
        <p className="route-endpoint__waiting">{waitingText}</p>
      ) : isSearching ? (
        <div className="route-endpoint__search">
          <AddressSearch
            label={`${label}: Adresse`}
            placeholder="Straße, Hausnummer, Ort"
            showAttribution={false}
            autoFocus
            onAddressSelect={(result) =>
              choose({ point: result.point, label: result.label })
            }
          />
          <button
            type="button"
            className="route-endpoint__cancel"
            onClick={() => {
              setIsSearching(false);
              setPendingFocus("choices");
            }}
          >
            Suche abbrechen
          </button>
        </div>
      ) : (
        <ul ref={choicesRef} className="route-endpoint__choices">
          {savedPlaces.map((place) => (
            <li key={`${place.label}|${place.point.join(",")}`}>
              <button type="button" onClick={() => choose(place)}>
                {place.label}
              </button>
            </li>
          ))}
          {requestCurrentLocation && (
            <li>
              <button
                type="button"
                disabled={locationStatus === "requesting"}
                onClick={() => void useCurrentLocation()}
              >
                {locationStatus === "requesting" ? "Standort …" : "Mein Standort"}
              </button>
            </li>
          )}
          <li>
            <button type="button" onClick={() => setIsSearching(true)}>
              Adresse suchen
            </button>
          </li>
        </ul>
      )}
      {locationStatus === "error" && !value && (
        <p className="route-endpoint__error" role="status">
          Standort nicht verfügbar.
        </p>
      )}
    </div>
  );
}
