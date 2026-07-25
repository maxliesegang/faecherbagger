import { useCallback, useState } from "react";
import type { LngLat } from "../types/index.ts";

const LOCATION_TIMEOUT_MS = 30_000;

type CurrentLocationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "ready"; point: LngLat }
  | { status: "error"; message: string };

function getGeolocationErrorMessage(
  error: GeolocationPositionError,
): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Der Standortzugriff wurde nicht erlaubt.";
    case error.POSITION_UNAVAILABLE:
      return "Der aktuelle Standort konnte nicht bestimmt werden.";
    case error.TIMEOUT:
      return "Die Standortabfrage hat zu lange gedauert.";
    default:
      return "Der aktuelle Standort konnte nicht bestimmt werden.";
  }
}

/**
 * Requests a single location only after an explicit user action. The coordinate
 * is kept solely in React memory and can be discarded without a page reload.
 */
export function useCurrentLocation() {
  const [locationState, setLocationState] = useState<CurrentLocationState>({
    status: "idle",
  });

  const requestLocation = useCallback(async (): Promise<LngLat> => {
    if (!navigator.geolocation) {
      const message =
        "Standortzugriff wird von diesem Browser nicht unterstützt.";
      setLocationState({
        status: "error",
        message,
      });
      throw new Error(message);
    }

    setLocationState({ status: "requesting" });
    return new Promise<LngLat>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const point: LngLat = [coords.longitude, coords.latitude];
          setLocationState({
            status: "ready",
            point,
          });
          resolve(point);
        },
        (error) => {
          const message = getGeolocationErrorMessage(error);
          setLocationState({ status: "error", message });
          reject(new Error(message));
        },
        {
          enableHighAccuracy: false,
          maximumAge: 300_000,
          // A granted permission only allows the lookup; it does not guarantee
          // that the browser's location provider can return a fix quickly.
          timeout: LOCATION_TIMEOUT_MS,
        },
      );
    });
  }, []);

  const clearLocation = useCallback(
    () => setLocationState({ status: "idle" }),
    [],
  );

  return { locationState, requestLocation, clearLocation };
}

export type CurrentLocationController = ReturnType<typeof useCurrentLocation>;
