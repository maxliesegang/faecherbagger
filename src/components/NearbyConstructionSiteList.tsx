import type { ScopedSite } from "../lib/select-sites.ts";
import { formatDistance } from "../shared/distance.ts";
import {
  formatConstructionPeriod,
  formatRelativeDay,
  getConstructionCategoryLabel,
} from "../shared/construction-site-labels.ts";
import { ClientNavigationLink } from "./ClientNavigationLink.tsx";
import { ConstructionSiteBadges } from "./ConstructionSiteBadges.tsx";
import "./NearbyConstructionSiteList.css";

interface NearbyConstructionSiteListProps {
  /**
   * Already annotated by `selectSites`: this component renders `recency` and
   * `isUnseen` rather than working them out again, so it cannot disagree with
   * the counts above it.
   */
  scopedSites: readonly ScopedSite[];
  getSiteDetailsHref: (siteId: string) => string;
  onShowSiteDetails: (siteId: string) => void;
  onShowSiteOnMap: (siteId: string) => void;
  /** Accessible name of the list. */
  label: string;
}

/**
 * The app's primary content: construction sites around the visitor as cards,
 * distance first. Records new in the visitor's window carry a badge; the caller
 * decides which subset to pass in and in which order.
 */
export function NearbyConstructionSiteList({
  scopedSites,
  getSiteDetailsHref,
  onShowSiteDetails,
  onShowSiteOnMap,
  label,
}: NearbyConstructionSiteListProps) {
  return (
    <ul className="nearby-list" aria-label={label}>
      {scopedSites.map(({ site, distanceMeters, recency, isUnseen }) => {
        const isUnseenAndNew = recency !== null && isUnseen;

        return (
          <li key={site.id}>
            <article
              className={`nearby-card${isUnseenAndNew ? " nearby-card--unseen" : ""}`}
            >
              {/* Only area-scoped selections carry a distance; `?? 0` here
                  would render a confident "0 m" for a missing one. */}
              {distanceMeters !== null && (
                <p className="nearby-card__distance">
                  <strong>{formatDistance(distanceMeters)}</strong>
                  <span className="nearby-card__distance-label">entfernt</span>
                </p>
              )}

              <div className="nearby-card__main">
                <ConstructionSiteBadges
                  className="nearby-card__badges"
                  phase={site.phase}
                  closure={site.closure}
                  recency={recency}
                />

                <h3 className="nearby-card__title">
                  <ClientNavigationLink
                    href={getSiteDetailsHref(site.id)}
                    onNavigate={() => onShowSiteDetails(site.id)}
                  >
                    {site.location}
                  </ClientNavigationLink>
                </h3>
                <p className="nearby-card__municipality">
                  {site.municipality}
                  {recency !== null && (
                    <>
                      {" · "}
                      <span className="nearby-card__detected">
                        neu {formatRelativeDay(site.firstSeenAt)}
                      </span>
                    </>
                  )}
                </p>

                <dl className="nearby-card__facts">
                  <div>
                    <dt>Zeitraum</dt>
                    <dd>
                      {formatConstructionPeriod(site.startDate, site.endDate)}
                    </dd>
                  </div>
                  <div>
                    <dt>Art</dt>
                    <dd>{getConstructionCategoryLabel(site.category)}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className="nearby-card__map-button"
                  onClick={() => onShowSiteOnMap(site.id)}
                >
                  Auf Karte zeigen
                </button>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
