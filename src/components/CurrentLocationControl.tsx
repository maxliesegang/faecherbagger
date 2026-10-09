import { KernAlert, KernText } from "@kern-ux-annex/kern-react-kit";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";
import { AppIcon } from "./AppIcon.tsx";

interface CurrentLocationControlProps {
  locationController: CurrentLocationController;
  /** Requests the location and switches the results to "nearest first". */
  onUseCurrentLocation: () => Promise<void>;
}

/**
 * One location action next to search, including errors and withdrawal.
 */
export function CurrentLocationControl({
  locationController,
  onUseCurrentLocation,
}: CurrentLocationControlProps) {
  const { locationState, clearLocation } = locationController;
  const isReady = locationState.status === "ready";

  return (
    <div className="location-control">
      {/*
        Icon and short text; on phones only the icon shows and the text stays
        for screen readers, so the search field keeps the row.
      */}
      <button
        type="button"
        className="tool-button"
        aria-pressed={isReady}
        disabled={locationState.status === "requesting"}
        onClick={() => {
          if (isReady) clearLocation();
          else void onUseCurrentLocation().catch(() => undefined);
        }}
      >
        <AppIcon name="person-pin" isFilled={isReady} />
        <span className="tool-button__label">
          {locationState.status === "requesting"
            ? "Wird ermittelt …"
            : "In meiner Nähe"}
        </span>
      </button>

      {locationState.status === "error" && (
        <KernAlert variant="warning" title="Standort nicht verfügbar">
          <KernText>{locationState.message}</KernText>
        </KernAlert>
      )}
    </div>
  );
}
