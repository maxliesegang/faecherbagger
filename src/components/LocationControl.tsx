import {
  KernAlert,
  KernButton,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import { useState } from "react";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";

interface Props {
  location: CurrentLocationController;
}

export function LocationControl({ location }: Props) {
  const { state, request, clear } = location;
  const [open, setOpen] = useState(
    state.status === "ready" || state.status === "error",
  );

  return (
    <details
      className="kern-accordion location-control"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="kern-accordion__header">
        <span className="kern-title">
          {state.status === "ready"
            ? "Entfernung zu meinem Standort wird angezeigt"
            : "Nach Entfernung sortieren"}
        </span>
      </summary>
      <section className="kern-accordion__body location-control__body">
        <KernText>
          Zeigt die Luftlinie zu jeder Baustelle und ermöglicht die Sortierung
          danach. Der Standort bleibt ausschließlich in diesem Browser.
        </KernText>

        {state.status === "ready" ? (
          <KernButton
            type="button"
            variant="secondary"
            label="Standort entfernen"
            onClick={clear}
          />
        ) : (
          <KernButton
            type="button"
            variant="secondary"
            label={
              state.status === "requesting"
                ? "Standort wird ermittelt …"
                : "Meinen Standort verwenden"
            }
            disabled={state.status === "requesting"}
            onClick={request}
          />
        )}

        {state.status === "error" && (
          <KernAlert variant="warning" title="Standort nicht verfügbar">
            <KernText>{state.message}</KernText>
          </KernAlert>
        )}
      </section>
    </details>
  );
}
