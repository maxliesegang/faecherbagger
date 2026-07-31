import { useEffect } from "react";
import type { ConstructionSite, ISODate } from "../types/index.ts";
import {
  describeConstructionTiming,
  formatConstructionPeriod,
  formatISOTimestamp,
  getClosureLabel,
  getConstructionCategoryLabel,
} from "../shared/construction-site-labels.ts";
import { ClientNavigationLink } from "./ClientNavigationLink.tsx";
import { ConstructionSiteBadges } from "./ConstructionSiteBadges.tsx";
import { LazyConstructionSiteMap } from "./LazyConstructionSiteMap.tsx";
import "./ConstructionSiteDetail.css";

interface ConstructionSiteDetailProps {
  constructionSite: ConstructionSite;
  /** The day the dataset describes, for the timing sentence. */
  today: ISODate;
  overviewHref: string;
  onBack: () => void;
  onShowConstructionSiteOnMap: () => void;
}

export function ConstructionSiteDetail({
  constructionSite,
  today,
  overviewHref,
  onBack,
  onShowConstructionSiteOnMap,
}: ConstructionSiteDetailProps) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${constructionSite.location} – Fächerbagger`;
    return () => {
      document.title = previousTitle;
    };
  }, [constructionSite.location]);

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
          phase={constructionSite.phase}
          closure={constructionSite.closure}
        />
        <h2 id="detail-title">{constructionSite.location}</h2>
        <p>{constructionSite.municipality}</p>
        {/* The same sentence the card leads with, so opening a record does not
            change what it says about itself. */}
        <p className="construction-site-detail__timing">
          {describeConstructionTiming(constructionSite, today)}
        </p>
      </header>

      {constructionSite.notes && (
        <section className="construction-site-detail__notice">
          <h3>Hinweis</h3>
          <p>{constructionSite.notes}</p>
        </section>
      )}

      {/*
       * "Wo genau?" is the question this page exists to answer beyond the list,
       * and it is the one question a map answers better than a sentence. It
       * used to be a button that dropped the visitor into the region-wide
       * explorer, which lost both their place and their radius.
       */}
      <section className="construction-site-detail__map">
        <h3 className="kern-sr-only">Lage</h3>
        {/* No `selectedConstructionSiteId`: the selection panel repeats the
            page it is
            on, and on a compact map it covered the map entirely. */}
        <LazyConstructionSiteMap
          constructionSites={[constructionSite]}
          variant="compact"
          onSelectedConstructionSiteIdChange={() => undefined}
          getConstructionSiteDetailHref={() => overviewHref}
          onOpenConstructionSiteDetail={() => undefined}
          onShowList={onBack}
        />
        <button
          type="button"
          className="construction-site-detail__map-button"
          onClick={onShowConstructionSiteOnMap}
        >
          Im Umgebungsplan öffnen
        </button>
      </section>

      <dl className="construction-site-detail__facts">
        <div>
          <dt>Zeitraum</dt>
          <dd>
            {formatConstructionPeriod(
              constructionSite.startDate,
              constructionSite.endDate,
            )}
          </dd>
        </div>
        <div>
          <dt>Verkehrseinschränkung</dt>
          <dd>{getClosureLabel(constructionSite.closure)}</dd>
        </div>
        <div>
          <dt>Art der Baustelle</dt>
          <dd>{getConstructionCategoryLabel(constructionSite.category)}</dd>
        </div>
        <div>
          <dt>Verantwortlich</dt>
          <dd>{constructionSite.cause ?? "Keine Angabe"}</dd>
        </div>
      </dl>

      {/*
       * Administrative provenance. Real, and worth keeping for anyone asking
       * the city about this Vorgang, but it is not what the page is for: as
       * peers of the period and the closure these three rows made a
       * Vorgangsnummer look as decisive as a Vollsperrung.
       */}
      <p className="construction-site-detail__provenance">
        Vorgangsnummer {constructionSite.id} · Quelle {constructionSite.source}{" "}
        · aktualisiert{" "}
        {formatISOTimestamp(constructionSite.lastModified)}
      </p>
    </article>
  );
}
