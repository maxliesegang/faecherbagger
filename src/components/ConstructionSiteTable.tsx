import { useMemo, type ReactNode } from "react";
import type { ConstructionSite, LngLat } from "../types/index.ts";
import { distanceInMeters, formatDistance } from "../shared/distance.ts";
import type {
  ConstructionSiteSort,
  ConstructionSiteSortKey,
} from "../lib/construction-site-sort.ts";
import {
  getConstructionCategoryLabel,
  formatConstructionPeriod,
} from "../shared/construction-site-labels.ts";
import { ClientNavigationLink } from "./ClientNavigationLink.tsx";
import {
  ClosureBadge,
  ConstructionPhaseBadge,
  ConstructionSiteBadges,
} from "./ConstructionSiteBadges.tsx";
import "./ConstructionSiteTable.css";

interface ConstructionSiteTableProps {
  /** Already sorted by the caller; the header buttons only report intent. */
  constructionSites: readonly ConstructionSite[];
  sort: ConstructionSiteSort | null;
  onSortChange: (sort: ConstructionSiteSort | null) => void;
  currentLocation?: LngLat;
  onShowConstructionSiteOnMap?: (constructionSiteId: string) => void;
  getConstructionSiteDetailHref: (constructionSiteId: string) => string;
  onOpenConstructionSiteDetail: (constructionSiteId: string) => void;
}

interface ConstructionSiteTableColumn {
  key: ConstructionSiteSortKey;
  label: string;
  render: (site: ConstructionSite) => ReactNode;
  numeric?: boolean;
}

const BASE_COLUMNS: readonly ConstructionSiteTableColumn[] = [
  {
    key: "location",
    label: "Lage",
    render: (site) => site.location,
  },
  {
    key: "municipality",
    label: "Ort",
    render: (site) => site.municipality,
  },
  {
    key: "phase",
    label: "Status",
    render: (site) => <ConstructionPhaseBadge phase={site.phase} />,
  },
  {
    key: "period",
    label: "Zeitraum",
    render: (site) => formatConstructionPeriod(site.startDate, site.endDate),
  },
  {
    key: "category",
    label: "Art",
    render: (site) => getConstructionCategoryLabel(site.category),
  },
  {
    key: "closure",
    label: "Sperrung",
    render: (site) => <ClosureBadge closure={site.closure} />,
  },
];

function getNextSort(
  current: ConstructionSiteSort | null,
  key: ConstructionSiteSortKey,
) {
  return {
    key,
    direction:
      current?.key === key && current.direction === "ascending"
        ? "descending"
        : "ascending",
  } satisfies ConstructionSiteSort;
}

export function ConstructionSiteTable({
  constructionSites,
  sort,
  onSortChange,
  currentLocation,
  onShowConstructionSiteOnMap,
  getConstructionSiteDetailHref,
  onOpenConstructionSiteDetail,
}: ConstructionSiteTableProps) {
  const columns = useMemo<readonly ConstructionSiteTableColumn[]>(
    () =>
      currentLocation
        ? [
            ...BASE_COLUMNS,
            {
              key: "distance",
              label: "Entfernung",
              numeric: true,
              render: (site: ConstructionSite) =>
                formatDistance(distanceInMeters(currentLocation, site.point)),
            },
          ]
        : BASE_COLUMNS,
    [currentLocation],
  );

  return (
    <>
      <div className="construction-site-table kern-table-responsive">
        <table className="kern-table kern-table--striped kern-table--small">
          <thead className="kern-table__head">
            <tr className="kern-table__row">
              {columns.map((column) => {
                const active = sort?.key === column.key;
                const direction = active ? sort.direction : undefined;
                const nextDirection =
                  direction === "ascending" ? "absteigend" : "aufsteigend";

                return (
                  <th
                    key={column.key}
                    scope="col"
                    data-column={column.key}
                    {...(direction ? { "aria-sort": direction } : {})}
                    className={`kern-table__header${
                      column.numeric ? " kern-table__header--numeric" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="construction-site-table__sort-button"
                      aria-label={`${column.label} ${nextDirection} sortieren`}
                      onClick={() =>
                        onSortChange(getNextSort(sort, column.key))
                      }
                    >
                      {column.label}
                      <span
                        className="construction-site-table__sort-icon"
                        aria-hidden="true"
                      >
                        {direction === "ascending"
                          ? "▲"
                          : direction === "descending"
                            ? "▼"
                            : "↕"}
                      </span>
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="kern-table__header">
                <span className="kern-sr-only">Weitere Angaben</span>
              </th>
            </tr>
          </thead>
          <tbody className="kern-table__body">
            {constructionSites.map((site) => (
              <tr className="kern-table__row" key={site.id}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-column={column.key}
                    className={`kern-table__cell${
                      column.numeric ? " kern-table__cell--numeric" : ""
                    }`}
                  >
                    {column.render(site)}
                  </td>
                ))}
                <td className="kern-table__cell">
                  <div className="construction-site-table__actions">
                    {onShowConstructionSiteOnMap && (
                      <button
                        type="button"
                        className="construction-site-table__map-button"
                        onClick={() => onShowConstructionSiteOnMap(site.id)}
                      >
                        Auf Karte
                      </button>
                    )}
                    <ClientNavigationLink
                      className="construction-site-table__details-button"
                      href={getConstructionSiteDetailHref(site.id)}
                      onNavigate={() => onOpenConstructionSiteDetail(site.id)}
                    >
                      Details
                    </ClientNavigationLink>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="construction-site-cards" aria-label="Baustellenliste">
        {constructionSites.map((site) => (
          <article className="construction-site-card" key={site.id}>
            <ConstructionSiteBadges
              className="construction-site-card__topline"
              phase={site.phase}
              closure={site.closure}
            />
            <h3 className="construction-site-card__title">{site.location}</h3>
            <p className="construction-site-card__municipality">{site.municipality}</p>
            <dl className="construction-site-card__facts">
              <div>
                <dt>Zeitraum</dt>
                <dd>{formatConstructionPeriod(site.startDate, site.endDate)}</dd>
              </div>
              <div>
                <dt>Art</dt>
                <dd>{getConstructionCategoryLabel(site.category)}</dd>
              </div>
              {currentLocation && (
                <div>
                  <dt>Entfernung</dt>
                  <dd>
                    {formatDistance(
                      distanceInMeters(currentLocation, site.point),
                    )}
                  </dd>
                </div>
              )}
            </dl>
            <ClientNavigationLink
              className="construction-site-card__details-link"
              href={getConstructionSiteDetailHref(site.id)}
              onNavigate={() => onOpenConstructionSiteDetail(site.id)}
            >
              Details ansehen
            </ClientNavigationLink>
            {onShowConstructionSiteOnMap && (
              <button
                type="button"
                className="construction-site-card__map-button"
                onClick={() => onShowConstructionSiteOnMap(site.id)}
              >
                Auf Karte zeigen
              </button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
