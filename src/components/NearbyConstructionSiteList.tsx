import { useState } from "react";
import type { ISODate } from "../types/index.ts";
import type { ScopedConstructionSite } from "../lib/select-construction-sites.ts";
import { formatDistance } from "../shared/distance.ts";
import { describeConstructionTiming } from "../shared/construction-site-labels.ts";
import { ClientNavigationLink } from "./ClientNavigationLink.tsx";
import { ConstructionSiteBadges } from "./ConstructionSiteBadges.tsx";
import "./NearbyConstructionSiteList.css";

interface NearbyConstructionSiteListProps {
  /**
   * Already annotated by `selectConstructionSites`: this component renders
   * `recency` and
   * `isUnseen` rather than working them out again, so it cannot disagree with
   * the counts above it.
   */
  scopedConstructionSites: readonly ScopedConstructionSite[];
  /** The day the selection describes, for the timing sentence on each card. */
  today: ISODate;
  getConstructionSiteDetailHref: (constructionSiteId: string) => string;
  onOpenConstructionSiteDetail: (constructionSiteId: string) => void;
  /** Accessible name of the list. */
  label: string;
}

/**
 * How many cards a list shows before asking.
 *
 * "Alle" in a five-kilometre radius is 355 records, and rendering them produced
 * a page tens of thousands of pixels tall that no visitor ever reached the end
 * of. A first screenful plus an explicit request is both faster and more honest
 * about how much there is.
 */
const INITIAL_CARD_LIMIT = 25;

/**
 * The app's primary content: construction sites around the visitor as cards.
 *
 * The card leads with the street, because that is what a visitor recognizes,
 * and follows it with when the work happens, because that is what they decide
 * on. Distance used to be the largest thing on the card; inside a radius the
 * visitor chose, the difference between 1,8 km and 3,0 km decides nothing, so
 * it now sits with the other metadata.
 */
export function NearbyConstructionSiteList({
  scopedConstructionSites,
  today,
  getConstructionSiteDetailHref,
  onOpenConstructionSiteDetail,
  label,
}: NearbyConstructionSiteListProps) {
  const [limit, setLimit] = useState(INITIAL_CARD_LIMIT);
  // Switching the view has to start the list over; comparing during render
  // avoids first painting the previous view's expansion.
  const [lastSites, setLastSites] = useState(scopedConstructionSites);
  if (lastSites !== scopedConstructionSites) {
    setLastSites(scopedConstructionSites);
    setLimit(INITIAL_CARD_LIMIT);
  }

  const visibleSites = scopedConstructionSites.slice(0, limit);
  const hiddenCount = scopedConstructionSites.length - visibleSites.length;

  return (
    <>
      <ul className="nearby-list" aria-label={label}>
        {visibleSites.map((scoped) => {
          const { constructionSite, distanceMeters, recency, isUnseen } = scoped;
          const isUnseenAndNew = recency !== null && isUnseen;

          return (
            <li key={constructionSite.id}>
              <article
                className={`nearby-card${isUnseenAndNew ? " nearby-card--unseen" : ""}`}
              >
                {/* Traffic impact first: it is the one fact that can stop
                    someone getting through. The phase is left out here — the
                    timing line below says when far more precisely. */}
                <ConstructionSiteBadges
                  className="nearby-card__badges"
                  phase={constructionSite.phase}
                  showPhase={false}
                  closure={constructionSite.closure}
                  recency={recency}
                />

                <h3 className="nearby-card__title">
                  <ClientNavigationLink
                    href={getConstructionSiteDetailHref(constructionSite.id)}
                    onNavigate={() =>
                      onOpenConstructionSiteDetail(constructionSite.id)
                    }
                  >
                    {constructionSite.location}
                  </ClientNavigationLink>
                </h3>

                <p className="nearby-card__timing">
                  {describeConstructionTiming(constructionSite, today)}
                </p>

                {/*
                 * The source's own sentence about the site — "nur Fußweg frei",
                 * "Rad- und Fußweg wird umgeleitet". Two thirds of the records
                 * carry one, and it was reachable only from the detail page
                 * while the card spent its last line on the construction
                 * category, which changes nobody's route.
                 */}
                {constructionSite.notes && (
                  <p className="nearby-card__notes">{constructionSite.notes}</p>
                )}

                <p className="nearby-card__meta">
                  {constructionSite.municipality}
                  {/* Only area-scoped selections carry a distance; `?? 0` here
                      would render a confident "0 m" for a missing one. */}
                  {distanceMeters !== null && (
                    <>
                      {" · "}
                      {formatDistance(distanceMeters)} entfernt
                    </>
                  )}
                </p>
              </article>
            </li>
          );
        })}
      </ul>

      {hiddenCount > 0 && (
        <button
          type="button"
          className="nearby-list__more"
          onClick={() => setLimit(scopedConstructionSites.length)}
        >
          Weitere {hiddenCount} anzeigen
        </button>
      )}
    </>
  );
}
