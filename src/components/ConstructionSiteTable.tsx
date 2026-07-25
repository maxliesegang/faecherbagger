import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { KernBadge } from "@kern-ux-annex/kern-react-kit";
import type { ConstructionSite, LngLat } from "../types/index.ts";
import { distanceInMeters, formatDistance } from "../lib/distance.ts";
import {
  sortConstructionSites,
  sortConstructionSitesForDisplay,
  type ConstructionSiteSort,
  type ConstructionSiteSortKey,
} from "../lib/construction-site-sort.ts";
import {
  getConstructionCategoryLabel,
  getClosureLabel,
  getClosureBadgeVariant,
  formatConstructionPeriod,
  formatIsoTimestamp,
  getConstructionPhaseLabel,
  getConstructionPhaseBadgeVariant,
} from "../lib/construction-site-labels.ts";
import "./ConstructionSiteTable.css";

interface ConstructionSiteTableProps {
  constructionSites: readonly ConstructionSite[];
  currentLocation?: LngLat;
  onShowSiteOnMap?: (siteId: string) => void;
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
    render: (site) => (
      <KernBadge
        variant={getConstructionPhaseBadgeVariant(site.phase)}
        label={getConstructionPhaseLabel(site.phase)}
      />
    ),
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
    render: (site) => (
      <KernBadge
        variant={getClosureBadgeVariant(site.closure)}
        label={getClosureLabel(site.closure)}
      />
    ),
  },
  {
    key: "lastModified",
    label: "Aktualisiert",
    render: (site) => formatIsoTimestamp(site.lastModified),
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
  currentLocation,
  onShowSiteOnMap,
}: ConstructionSiteTableProps) {
  const [sort, setSort] = useState<ConstructionSiteSort | null>(null);
  const [expandedSiteIds, setExpandedSiteIds] = useState<Set<string>>(
    new Set(),
  );
  const effectiveSort =
    sort?.key === "distance" && !currentLocation ? null : sort;

  useEffect(() => {
    if (!currentLocation) {
      setSort((current) => (current?.key === "distance" ? null : current));
    }
  }, [currentLocation]);

  const columns = useMemo<readonly ConstructionSiteTableColumn[]>(
    () =>
      currentLocation
        ? [
            ...BASE_COLUMNS,
            {
              key: "distance",
              label: "Entfernung (Luftlinie)",
              numeric: true,
              render: (site: ConstructionSite) =>
                formatDistance(distanceInMeters(currentLocation, site.point)),
            },
          ]
        : BASE_COLUMNS,
    [currentLocation],
  );

  const sortedConstructionSites = useMemo(
    () =>
      effectiveSort
        ? sortConstructionSites(
            constructionSites,
            effectiveSort,
            currentLocation,
          )
        : sortConstructionSitesForDisplay(constructionSites),
    [constructionSites, currentLocation, effectiveSort],
  );

  const toggleExpanded = (id: string) => {
    setExpandedSiteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
                        setSort((current) => getNextSort(current, column.key))
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
            {sortedConstructionSites.map((site) => {
              const isExpanded = expandedSiteIds.has(site.id);
              return (
                <Fragment key={site.id}>
                  <tr className="kern-table__row">
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`kern-table__cell${
                          column.numeric ? " kern-table__cell--numeric" : ""
                        }`}
                      >
                        {column.render(site)}
                      </td>
                    ))}
                    <td className="kern-table__cell">
                      <div className="construction-site-table__actions">
                        {onShowSiteOnMap && (
                          <button
                            type="button"
                            className="construction-site-table__map-button"
                            onClick={() => onShowSiteOnMap(site.id)}
                          >
                            Auf Karte
                          </button>
                        )}
                        <button
                          type="button"
                          className="construction-site-table__details-button"
                          aria-expanded={isExpanded}
                          aria-controls={`details-${site.id}`}
                          onClick={() => toggleExpanded(site.id)}
                        >
                          {isExpanded ? "Schließen" : "Details"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr
                      key={`${site.id}-details`}
                      id={`details-${site.id}`}
                      className="construction-site-table__details-row"
                    >
                      <td colSpan={columns.length + 1}>
                        <ConstructionSiteDetails site={site} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="construction-site-cards" aria-label="Baustellenliste">
        {sortedConstructionSites.map((site) => (
          <article className="construction-site-card" key={site.id}>
            <div className="construction-site-card__topline">
              <KernBadge
                variant={getConstructionPhaseBadgeVariant(site.phase)}
                label={getConstructionPhaseLabel(site.phase)}
              />
              <KernBadge
                variant={getClosureBadgeVariant(site.closure)}
                label={getClosureLabel(site.closure)}
              />
            </div>
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
            <details className="construction-site-card__details">
              <summary>Weitere Angaben</summary>
              <ConstructionSiteDetails site={site} />
            </details>
            {onShowSiteOnMap && (
              <button
                type="button"
                className="construction-site-card__map-button"
                onClick={() => onShowSiteOnMap(site.id)}
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

function ConstructionSiteDetails({ site }: { site: ConstructionSite }) {
  return (
    <dl className="construction-site-details">
      {site.notes && (
        <div className="construction-site-details__wide">
          <dt>Hinweis</dt>
          <dd>{site.notes}</dd>
        </div>
      )}
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
        <dd>{formatIsoTimestamp(site.lastModified)}</dd>
      </div>
    </dl>
  );
}
