import { useEffect } from "react";
import type { ConstructionSite } from "../types/index.ts";
import {
  formatConstructionPeriod,
  formatISOTimestamp,
  getClosureLabel,
  getConstructionCategoryLabel,
} from "../shared/construction-site-labels.ts";
import { ClientNavigationLink } from "./ClientNavigationLink.tsx";
import { ConstructionSiteBadges } from "./ConstructionSiteBadges.tsx";
import "./ConstructionSiteDetail.css";

interface ConstructionSiteDetailProps {
  site: ConstructionSite;
  overviewHref: string;
  onBack: () => void;
  onShowOnMap: () => void;
}

export function ConstructionSiteDetail({
  site,
  overviewHref,
  onBack,
  onShowOnMap,
}: ConstructionSiteDetailProps) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${site.location} – Fächerbagger`;
    return () => {
      document.title = previousTitle;
    };
  }, [site.location]);

  return (
    <article className="construction-site-detail" aria-labelledby="detail-title">
      <ClientNavigationLink
        className="construction-site-detail__back"
        href={overviewHref}
        onNavigate={onBack}
      >
        ← Zur Baustellenübersicht
      </ClientNavigationLink>

      <header className="construction-site-detail__header">
        <ConstructionSiteBadges
          className="construction-site-detail__badges"
          phase={site.phase}
          closure={site.closure}
        />
        <h2 id="detail-title">{site.location}</h2>
        <p>{site.municipality}</p>
      </header>

      {site.notes && (
        <section className="construction-site-detail__notice">
          <h3>Hinweis</h3>
          <p>{site.notes}</p>
        </section>
      )}

      <dl className="construction-site-detail__facts">
        <div>
          <dt>Zeitraum</dt>
          <dd>{formatConstructionPeriod(site.startDate, site.endDate)}</dd>
        </div>
        <div>
          <dt>Art der Baustelle</dt>
          <dd>{getConstructionCategoryLabel(site.category)}</dd>
        </div>
        <div>
          <dt>Verkehrseinschränkung</dt>
          <dd>{getClosureLabel(site.closure)}</dd>
        </div>
        <div>
          <dt>Verantwortlich</dt>
          <dd>{site.cause ?? "Keine Angabe"}</dd>
        </div>
        <div>
          <dt>Datenquelle</dt>
          <dd>{site.source}</dd>
        </div>
        <div>
          <dt>Vorgangsnummer</dt>
          <dd>{site.id}</dd>
        </div>
        <div>
          <dt>Aktualisiert</dt>
          <dd>{formatISOTimestamp(site.lastModified)}</dd>
        </div>
      </dl>

      <button
        type="button"
        className="construction-site-detail__map-button"
        onClick={onShowOnMap}
      >
        Auf Karte anzeigen
      </button>
    </article>
  );
}
