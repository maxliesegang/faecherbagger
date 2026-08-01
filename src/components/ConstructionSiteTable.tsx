import {
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { KernBadge, KernButton, KernIcon } from "@kern-ux-annex/kern-react-kit";
import type { ConstructionSite, LngLat } from "../types/index.ts";
import { distanceInMeters, formatDistance } from "../lib/distance.ts";
import type {
  ConstructionSiteSort,
  ConstructionSiteSortKey,
} from "../lib/construction-site-sort.ts";
import {
  getConstructionCategoryLabel,
  getClosureLabel,
  getClosureBadgeVariant,
  formatConstructionPeriod,
  getConstructionPhaseLabel,
  getConstructionPhaseBadgeVariant,
} from "../lib/construction-site-labels.ts";
import {
  formatConstructionPeriodRelativeToToday,
  getBerlinCalendarDate,
} from "../lib/construction-site-timeframe.ts";
import {
  INCREMENTAL_LIST_PAGE_SIZE,
  useIncrementalList,
} from "../hooks/useIncrementalList.ts";
import type { ResultLayout } from "../hooks/useResultLayout.ts";
import "./ConstructionSiteTable.css";

interface ConstructionSiteTableProps {
  /** Already sorted by the caller; the header buttons only report intent. */
  constructionSites: readonly ConstructionSite[];
  /** Chosen by the caller from the width the results column actually has. */
  layout: ResultLayout;
  sort: ConstructionSiteSort | null;
  onSortChange: (sort: ConstructionSiteSort | null) => void;
  currentLocation?: LngLat;
  onShowSiteOnMap?: (siteId: string) => void;
  getSiteDetailsHref: (siteId: string) => string;
  onShowSiteDetails: (siteId: string) => void;
}

interface ConstructionSiteTableColumn {
  key: ConstructionSiteSortKey;
  label: string;
  render: (site: ConstructionSite, today: string) => ReactNode;
  numeric?: boolean;
}

/** True for a plain left-click, i.e. one that should not open a new tab. */
const isPlainClick = (event: ReactMouseEvent): boolean =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * `location` is the identifying column, so it carries the link to the detail
 * view: one obvious target per row instead of a separate action column, which
 * was the first thing to be clipped once the table had to share the width with
 * the control rail.
 */
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
    render: (site, today) => {
      const relative = formatConstructionPeriodRelativeToToday(site, today);
      return (
        <>
          <span className="construction-site-table__period">
            {formatConstructionPeriod(site.startDate, site.endDate)}
          </span>
          {relative && (
            <span className="construction-site-table__period-relative">
              {relative}
            </span>
          )}
        </>
      );
    },
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
  layout,
  sort,
  onSortChange,
  currentLocation,
  onShowSiteOnMap,
  getSiteDetailsHref,
  onShowSiteDetails,
}: ConstructionSiteTableProps) {
  const today = useMemo(() => getBerlinCalendarDate(), []);
  const { visibleItems, remainingCount, showMore } =
    useIncrementalList(constructionSites);
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

  const renderDetailLink = (site: ConstructionSite, className: string) => (
    <a
      className={className}
      href={getSiteDetailsHref(site.id)}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onShowSiteDetails(site.id);
      }}
    >
      {site.location}
    </a>
  );

  const renderMapButton = (
    site: ConstructionSite,
    className: string,
    label?: string,
  ) =>
    onShowSiteOnMap && (
      <button
        type="button"
        className={className}
        aria-label={`${site.location} auf der Karte zeigen`}
        onClick={() => onShowSiteOnMap(site.id)}
      >
        {/* KERN has no map pin; "show" is the closest honest icon. */}
        <KernIcon icon="visibility" />
        {label && <span aria-hidden="true">{label}</span>}
      </button>
    );

  const showMoreButton = remainingCount > 0 && (
    <div className="construction-site-list__more">
      <KernButton
        type="button"
        variant="secondary"
        label={`Weitere ${Math.min(remainingCount, INCREMENTAL_LIST_PAGE_SIZE)} anzeigen`}
        onClick={showMore}
      />
      <p className="construction-site-list__more-count" aria-live="polite">
        {visibleItems.length} von {constructionSites.length} angezeigt
      </p>
    </div>
  );

  if (layout === "cards") {
    return (
      <>
        <div className="construction-site-cards" aria-label="Baustellenliste">
          {visibleItems.map((site) => {
            const relative = formatConstructionPeriodRelativeToToday(
              site,
              today,
            );
            return (
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
                <h3 className="construction-site-card__title">
                  {renderDetailLink(
                    site,
                    "construction-site-card__details-link",
                  )}
                </h3>
                <p className="construction-site-card__municipality">
                  {site.municipality}
                </p>
                <dl className="construction-site-card__facts">
                  <div>
                    <dt>Zeitraum</dt>
                    <dd>
                      {formatConstructionPeriod(site.startDate, site.endDate)}
                      {relative && (
                        <span className="construction-site-table__period-relative">
                          {relative}
                        </span>
                      )}
                    </dd>
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
                {renderMapButton(
                  site,
                  "construction-site-card__map-button",
                  "Auf der Karte zeigen",
                )}
              </article>
            );
          })}
        </div>
        {showMoreButton}
      </>
    );
  }

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
                      className={`construction-site-table__sort-button${
                        active ? " construction-site-table__sort-button--active" : ""
                      }`}
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
                        <KernIcon
                          icon={
                            direction === "ascending" ? "arrow-up" : "arrow-down"
                          }
                        />
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="kern-table__body">
            {visibleItems.map((site) => (
              <tr className="kern-table__row" key={site.id}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-column={column.key}
                    className={`kern-table__cell${
                      column.numeric ? " kern-table__cell--numeric" : ""
                    }`}
                  >
                    {column.key === "location" ? (
                      <div className="construction-site-table__location">
                        {renderDetailLink(
                          site,
                          "construction-site-table__details-link",
                        )}
                        {renderMapButton(
                          site,
                          "construction-site-table__map-button",
                        )}
                      </div>
                    ) : (
                      column.render(site, today)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showMoreButton}
    </>
  );
}
