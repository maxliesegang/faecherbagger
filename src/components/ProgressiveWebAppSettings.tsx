import { useState } from "react";
import { KernButton, KernText } from "@kern-ux-annex/kern-react-kit";
import {
  isIosDevice,
  type ProgressiveWebAppController,
} from "../hooks/useProgressiveWebApp.ts";
import "./ProgressiveWebAppSettings.css";

interface ProgressiveWebAppSettingsProps {
  progressiveWebApp: ProgressiveWebAppController;
}

/**
 * Secondary app-level actions: install the PWA and refresh the committed data
 * on demand. This is the only place that offers the installation — the
 * notification section explains what installing unlocks and links no further,
 * so there is one button for it rather than two that can drift apart.
 */
export function ProgressiveWebAppSettings({
  progressiveWebApp,
}: ProgressiveWebAppSettingsProps) {
  const [refreshMessage, setRefreshMessage] = useState<string>();
  const feedbackMessage = refreshMessage ?? progressiveWebApp.installMessage;

  return (
    <details className="kern-accordion pwa-panel">
      <summary className="kern-accordion__header">
        <span className="kern-title">App installieren und aktualisieren</span>
      </summary>
      <section className="kern-accordion__body pwa-panel__body">
        <KernText className="pwa-panel__intro">
          Fächerbagger lässt sich wie eine App installieren und funktioniert
          dann auch offline mit dem zuletzt geladenen Datenstand.
        </KernText>

        <div className="pwa-panel__actions">
          {progressiveWebApp.canInstall && (
            <KernButton
              type="button"
              variant="secondary"
              label="App installieren"
              onClick={() => void progressiveWebApp.promptInstallation()}
            />
          )}
          <KernButton
            type="button"
            variant="tertiary"
            label="Daten jetzt aktualisieren"
            onClick={() => {
              progressiveWebApp.requestDataRefresh();
              setRefreshMessage("Aktualisierung wurde angefordert.");
            }}
          />
        </div>

        {!progressiveWebApp.isInstalled &&
          !progressiveWebApp.canInstall &&
          isIosDevice && (
            <KernText muted className="pwa-panel__hint">
              Auf iPhone/iPad: In Safari „Teilen“ und danach „Zum
              Home-Bildschirm“ wählen. Benachrichtigungen sind anschließend in
              der installierten App verfügbar.
            </KernText>
          )}

        {feedbackMessage && (
          <KernText className="pwa-panel__feedback" aria-live="polite">
            {feedbackMessage}
          </KernText>
        )}
      </section>
    </details>
  );
}
