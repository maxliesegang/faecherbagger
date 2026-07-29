import type { ISOTimestamp } from "../types/index.ts";
import type { NearbyConstructionSite } from "../lib/nearby-construction-sites.ts";
import { isUnseenConstructionSiteChange } from "../lib/nearby-construction-sites.ts";
import { formatDistance } from "../lib/distance.ts";
import {
  formatConstructionPeriod,
  formatRelativeDay,
  getConstructionCategoryLabel,
} from "../lib/construction-site-labels.ts";
import { ClientNavigationLink } from "./ClientNavigationLink.tsx";
import { ConstructionSiteBadges } from "./ConstructionSiteBadges.tsx";
import "./NearbyConstructionSiteList.css";

interface NearbyConstructionSiteListProps {
  nearbyConstructionSites: readonly NearbyConstructionSite[];
  /** Marks changes newer than the visitor's last acknowledgement. */
  seenAt: ISOTimestamp | null;
  getSiteDetailsHref: (siteId: string) => string;
  onShowSiteDetails: (siteId: string) => void;
  onShowSiteOnMap: (siteId: string) => void;
  /** Accessible name of the list. */
  label: string;
}

/**
 * The app's primary content: construction sites around the visitor as cards,
 * distance first. New and updated records carry a change badge; the caller
 * decides which subset to pass in and in which order.
 */
export function NearbyConstructionSiteList({
  nearbyConstructionSites,
  seenAt,
  getSiteDetailsHref,
  onShowSiteDetails,
  onShowSiteOnMap,
  label,
}: NearbyConstructionSiteListProps) {
  return (
    <ul className="nearby-list" aria-label={label}>
      {nearbyConstructionSites.map((entry) => {
        const { site } = entry;
        const isUnseen = isUnseenConstructionSiteChange(
          entry.detectedAt,
          seenAt,
        );

        return (
          <li key={site.id}>
            <article
              className={`nearby-card${isUnseen ? " nearby-card--unseen" : ""}`}
            >
              <p className="nearby-card__distance">
                <strong>{formatDistance(entry.distanceMeters)}</strong>
                <span className="nearby-card__distance-label">entfernt</span>
              </p>

              <div className="nearby-card__main">
                <ConstructionSiteBadges
                  className="nearby-card__badges"
                  phase={site.phase}
                  closure={site.closure}
                  changeStatus={entry.changeStatus}
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
                  {entry.detectedAt && (
                    <>
                      {" · "}
                      <span className="nearby-card__detected">
                        {entry.changeStatus === "added"
                          ? "neu "
                          : "aktualisiert "}
                        {formatRelativeDay(entry.detectedAt)}
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
