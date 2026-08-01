import {
  KernAlert,
  KernButton,
  KernHeading,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";

interface CurrentLocationControlProps {
  locationController: CurrentLocationController;
  /** Requests the location and switches the results to "nearest first". */
  onUseCurrentLocation: () => Promise<void>;
}

/**
 * Compact rail card. The main entry point for sharing a location is the button
 * in the page header; this card repeats it, reports failures and is the only
 * place that can withdraw the location again.
 */
export function CurrentLocationControl({
  locationController,
  onUseCurrentLocation,
}: CurrentLocationControlProps) {
  const { locationState, clearLocation } = locationController;
  const isReady = locationState.status === "ready";

  return (
    <section className="location-control" aria-labelledby="location-heading">
      <div className="location-control__heading">
        <KernHeading level={2} id="location-heading">
          Mein Standort
        </KernHeading>
        {isReady && (
          <span className="location-control__state">
            <span className="location-control__dot" aria-hidden="true" />
            aktiv
          </span>
        )}
      </div>

      <KernText muted className="location-control__intro">
        {isReady
          ? "Die Karte zeigt Ihren Umkreis, die Liste ist nach Entfernung sortiert. Der Standort bleibt im Browser."
          : "Zeigt Ihren Umkreis auf der Karte und sortiert die Liste nach Nähe. Der Standort bleibt im Browser."}
      </KernText>

      {isReady ? (
        <KernButton
          type="button"
          variant="tertiary"
          label="Standort entfernen"
          onClick={clearLocation}
        />
      ) : (
        <KernButton
          type="button"
          variant="secondary"
          label={
            locationState.status === "requesting"
              ? "Standort wird ermittelt …"
              : "Meinen Standort verwenden"
          }
          disabled={locationState.status === "requesting"}
          onClick={() => {
            // The hook exposes the failure through locationState for this
            // control. Consume the rejected promise to avoid an uncaught
            // rejection in the browser console.
            void onUseCurrentLocation().catch(() => undefined);
          }}
        />
      )}

      {locationState.status === "error" && (
        <KernAlert variant="warning" title="Standort nicht verfügbar">
          <KernText>{locationState.message}</KernText>
        </KernAlert>
      )}
    </section>
  );
}
