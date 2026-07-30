import {
  KernButton,
  KernHeading,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import { useView } from "../context/ViewContext.tsx";
import { FeedLinks } from "./FeedLinks.tsx";
import { HomeAreaSetup } from "./HomeAreaSetup.tsx";
import { NotificationStatusCard } from "./NotificationStatusCard.tsx";
import "./NotificationSettings.css";

/**
 * The notification section: one screen that answers "bekomme ich etwas mit?"
 * and lets the visitor change the answer.
 *
 * Notifications used to live in an accordion at the bottom of the surroundings
 * screen. They are the reason this app is installed on a phone, so they get a
 * place of their own — together with the area they are about, because for the
 * visitor those are one decision ("melde mir Baustellen hier").
 */
export function NotificationSettings() {
  const { showExplorer } = useView();

  return (
    <section className="notifications" aria-labelledby="notifications-heading">
      <header className="notifications__header">
        <KernHeading level={2} id="notifications-heading">
          Benachrichtigungen
        </KernHeading>
        <KernText className="notifications__intro">
          Fächerbagger meldet Ihnen neue Baustellen in Ihrem Gebiet — ohne dass
          Sie nachsehen müssen.
        </KernText>
      </header>

      <NotificationStatusCard variant="detailed" />

      <div className="notifications__panel">
        <KernHeading level={3} className="notifications__panel-heading">
          Mein Gebiet
        </KernHeading>
        <KernText muted className="notifications__panel-intro">
          Gemeldet wird, was in diesem Umkreis neu dazukommt. Dasselbe Gebiet
          bestimmt auch, was die Umgebungsseite zeigt.
        </KernText>
        <HomeAreaSetup />
      </div>

      <div className="notifications__panel notifications__panel--quiet">
        <KernHeading level={3} className="notifications__panel-heading">
          Lieber ohne Push?
        </KernHeading>
        <KernText className="notifications__panel-intro">
          Neue Baustellen der ganzen Region gibt es auch als Feed, und die
          Umgebungsseite zeigt sie ohne jede Freigabe.
        </KernText>
        <p className="notifications__alternatives">
          <FeedLinks />
        </p>
        <span className="notifications__panel-actions">
          <KernButton
            type="button"
            variant="tertiary"
            label="Alle Baustellen der Region durchsuchen"
            onClick={showExplorer}
          />
        </span>
      </div>
    </section>
  );
}
