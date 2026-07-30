import {
  KernAlert,
  KernButton,
  KernHeading,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import { usePersonal } from "../context/PersonalContext.tsx";
import "./CurrentLocationControl.css";

/**
 * Compact rail card. Sharing a location unlocks distances and the "nearest
 * first" sort, so it stays one click away instead of behind a disclosure.
 */
export function CurrentLocationControl() {
  const {
    location: { locationState, requestLocation, clearLocation },
  } = usePersonal();
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
          ? "Entfernungen werden angezeigt und lassen sich sortieren. Der Standort bleibt im Browser."
          : "Zeigt die Luftlinie zu jeder Baustelle und ermöglicht die Sortierung nach Nähe. Der Standort bleibt im Browser."}
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
            void requestLocation().catch(() => undefined);
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
