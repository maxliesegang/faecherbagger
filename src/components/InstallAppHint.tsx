import { KernButton } from "@kern-ux-annex/kern-react-kit";
import type { InstallPlatform } from "../lib/install-platform.ts";
import { AppIcon } from "./AppIcon.tsx";
import "./InstallAppHint.css";

interface InstallAppHintProps {
  /** The browser's own install prompt, when it offers one. */
  install?: () => Promise<void>;
  installPlatform: InstallPlatform;
}

/**
 * Explains what installing means and how, folded away until asked for. Many
 * visitors have never added a web app, so the steps match their device rather
 * than a button that only Chromium can offer.
 */
export function InstallAppHint({ install, installPlatform }: InstallAppHintProps) {
  return (
    <details className="install-app-hint">
      <summary>Als App nutzen</summary>
      <div className="install-app-hint__body">
        <p>
          Startet ohne Browserleiste und funktioniert offline. Kostenlos, ohne
          App Store.
        </p>
        {install ? (
          <div>
            <KernButton
              type="button"
              variant="secondary"
              label="App installieren"
              onClick={() => void install()}
            />
          </div>
        ) : installPlatform === "apple-mobile" ? (
          <ol className="install-app-hint__steps">
            <li>
              Tippen Sie auf „Teilen“
              <AppIcon name="share" className="install-app-hint__icon" />.
            </li>
            <li>Wählen Sie „Zum Home-Bildschirm“.</li>
            <li>Öffnen Sie Fächerbagger dann vom Home-Bildschirm.</li>
          </ol>
        ) : installPlatform === "safari-mac" ? (
          <p>Wählen Sie im Menü „Ablage“ › „Zum Dock hinzufügen“.</p>
        ) : (
          <p>
            Wählen Sie im Browsermenü „Zum Startbildschirm hinzufügen“ oder
            „App installieren“.
          </p>
        )}
      </div>
    </details>
  );
}
