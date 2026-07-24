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

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState({
        status: "error",
        message: "Standortzugriff wird von diesem Browser nicht unterstützt.",
      });
      return;
    }

    setState({ status: "requesting" });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setState({
          status: "ready",
          point: [coords.longitude, coords.latitude],
        }),
      (error) =>
        setState({ status: "error", message: locationErrorMessage(error) }),
      {
        enableHighAccuracy: false,
        maximumAge: 300_000,
        timeout: 10_000,
      },
    );
  }, []);

  const clear = useCallback(() => setState({ status: "idle" }), []);

  return { state, request, clear };
}

export type CurrentLocationController = ReturnType<typeof useCurrentLocation>;
