import {
  KernAlert,
  KernButton,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import { useState } from "react";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";

interface CurrentLocationControlProps {
  locationController: CurrentLocationController;
}

export function CurrentLocationControl({
  locationController,
}: CurrentLocationControlProps) {
  const { locationState, requestLocation, clearLocation } = locationController;
  const [open, setOpen] = useState(
    locationState.status === "ready" || locationState.status === "error",
  );

  return (
    <details
      className="kern-accordion location-control"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="kern-accordion__header">
        <span className="kern-title">
          {locationState.status === "ready"
            ? "Entfernung zu meinem Standort wird angezeigt"
            : "Nach Entfernung sortieren"}
        </span>
      </summary>
      <section className="kern-accordion__body location-control__body">
        <KernText>
          Zeigt die Luftlinie zu jeder Baustelle und ermöglicht die Sortierung
          danach. Der Standort bleibt im Browser, außer Sie verwenden ihn
          ausdrücklich als Mittelpunkt für Baustellenbenachrichtigungen.
        </KernText>

        {locationState.status === "ready" ? (
          <KernButton
            type="button"
            variant="secondary"
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
            onClick={() => void requestLocation()}
          />
        )}

        {locationState.status === "error" && (
          <KernAlert variant="warning" title="Standort nicht verfügbar">
            <KernText>{locationState.message}</KernText>
          </KernAlert>
        )}
      </section>
    </details>
  );
}
