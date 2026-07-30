import { KernHeading, KernText } from "@kern-ux-annex/kern-react-kit";
import { usePersonal } from "../context/PersonalContext.tsx";
import { FeedLinks } from "./FeedLinks.tsx";
import { HomeAreaSetup } from "./HomeAreaSetup.tsx";
import { NotificationStatusCard } from "./NotificationStatusCard.tsx";
import "./NotificationSettings.css";

/**
 * The notification section: one screen that answers "bekomme ich etwas mit?"
 * and carries everything that decides the answer.
 *
 * The area lives here rather than on the surroundings screen because the
 * distance *is* the notification setting — "melde mir neue Baustellen bis 5 km"
 * is one decision, and splitting it across two screens meant the switch on this
 * one promised something the visitor had configured somewhere else. The
 * surroundings screen reads the same area to scope its lists.
 */
export function NotificationSettings() {
  const { area: homeArea } = usePersonal();

  return (
    <section
      className="notifications app-screen"
      aria-labelledby="notifications-heading"
    >
      <header className="app-screen__header">
        <KernHeading level={2} id="notifications-heading">
          Benachrichtigungen
        </KernHeading>
        <KernText className="app-screen__intro">
          Fächerbagger meldet Ihnen neue Baustellen in Ihrer Nähe — ohne dass
          Sie nachsehen müssen.
        </KernText>
      </header>

      <NotificationStatusCard />

      <div className="notifications__panel">
        <KernHeading level={3} className="notifications__panel-heading">
          Wo und wie weit?
        </KernHeading>
        <KernText muted className="notifications__panel-intro">
          {homeArea
            ? `Gemeldet wird jede neue Baustelle bis ${homeArea.radiusKm} km um Ihren Mittelpunkt. Derselbe Umkreis füllt den Bereich „Mein Umkreis“.`
            : "Ohne Mittelpunkt und Entfernung gibt es nichts zu melden. Beides legen Sie hier fest — es füllt auch den Bereich „Mein Umkreis“."}
        </KernText>
        <HomeAreaSetup />
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
