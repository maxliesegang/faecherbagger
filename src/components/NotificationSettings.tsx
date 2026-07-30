import {
  KernButton,
  KernHeading,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import { usePersonal } from "../context/PersonalContext.tsx";
import { useView } from "../context/ViewContext.tsx";
import { FeedLinks } from "./FeedLinks.tsx";
import { NotificationStatusCard } from "./NotificationStatusCard.tsx";
import "./NotificationSettings.css";

/**
 * The notification section: one screen that answers "bekomme ich etwas mit?"
 * and lets the visitor change the answer.
 *
 * It states the radius it would report on but does not edit it — that is the
 * surroundings screen, which is named after it and shows it on a map. Here the
 * radius is one line and a link, so this screen stays about the single decision
 * it owns.
 */
export function NotificationSettings() {
  const { showSurroundings } = useView();
  const { area: homeArea } = usePersonal();

  return (
    <section className="notifications" aria-labelledby="notifications-heading">
      <header className="notifications__header">
        <KernHeading level={2} id="notifications-heading">
          Benachrichtigungen
        </KernHeading>
        <KernText className="notifications__intro">
          Fächerbagger meldet Ihnen neue Baustellen in Ihrem Umkreis — ohne dass
          Sie nachsehen müssen.
        </KernText>
      </header>

      <NotificationStatusCard />

      <div className="notifications__panel">
        <KernHeading level={3} className="notifications__panel-heading">
          Gemeldeter Umkreis
        </KernHeading>
        <KernText muted className="notifications__panel-intro">
          {homeArea
            ? `Gemeldet wird jede neue Baustelle im Umkreis von ${homeArea.radiusKm} km um Ihren Mittelpunkt. Derselbe Umkreis bestimmt, was der Bereich „Mein Umkreis“ zeigt.`
            : "Noch kein Umkreis festgelegt. Er bestimmt sowohl die Meldungen als auch den Bereich „Mein Umkreis“."}
        </KernText>
        <span className="notifications__panel-actions">
          <KernButton
            type="button"
            variant={homeArea ? "tertiary" : "secondary"}
            label={homeArea ? "Umkreis ändern" : "Umkreis festlegen"}
            onClick={showSurroundings}
          />
        </span>
      </div>

      <div className="notifications__panel notifications__panel--quiet">
        <KernHeading level={3} className="notifications__panel-heading">
          Lieber ohne Push?
        </KernHeading>
        <KernText className="notifications__panel-intro">
          Neue Baustellen der ganzen Region gibt es auch als Feed — ohne
          Freigabe, ohne Konto und in jedem Feedreader.
        </KernText>
        <p className="notifications__alternatives">
          <FeedLinks />
        </p>
      </div>
    </section>
  );
}
