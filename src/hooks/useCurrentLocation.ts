import { useCallback, useState } from "react";
import type { LngLat } from "../types/index.ts";

type LocationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "ready"; point: LngLat }
  | { status: "error"; message: string };

function locationErrorMessage(error: GeolocationPositionError): string {
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
  const [state, setState] = useState<LocationState>({ status: "idle" });

  const request = useCallback(async (): Promise<LngLat> => {
    if (!navigator.geolocation) {
      const message =
        "Standortzugriff wird von diesem Browser nicht unterstützt.";
      setState({
        status: "error",
        message,
      });
      throw new Error(message);
    }

    setState({ status: "requesting" });
    return new Promise<LngLat>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const point: LngLat = [coords.longitude, coords.latitude];
          setState({
            status: "ready",
            point,
          });
          resolve(point);
        },
        (error) => {
          const message = locationErrorMessage(error);
          setState({ status: "error", message });
          reject(new Error(message));
        },
        {
          enableHighAccuracy: false,
          maximumAge: 300_000,
          timeout: 10_000,
        },
      );
    });
  }, []);

  const clear = useCallback(() => setState({ status: "idle" }), []);

  return { state, request, clear };
}

export type CurrentLocationController = ReturnType<typeof useCurrentLocation>;
