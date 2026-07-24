import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { KernBadge } from "@kern-ux-annex/kern-react-kit";
import type { Baustelle, LngLat } from "../types/index.ts";
import { distanceInMeters, formatDistance } from "../lib/distance.ts";
import {
  sortBaustellen,
  sortBaustellenForDisplay,
  type BaustellenSort,
  type BaustellenSortKey,
} from "../lib/sort.ts";
import {
  categoryLabel,
  closureLabel,
  closureVariant,
  formatPeriod,
  formatTimestamp,
  phaseLabel,
  phaseVariant,
} from "../lib/labels.ts";
import "./BaustellenTable.css";

interface Props {
  records: Baustelle[];
  currentLocation?: LngLat;
  onShowOnMap?: (id: string) => void;
}

interface Column {
  key: BaustellenSortKey;
  label: string;
  render: (record: Baustelle) => ReactNode;
  numeric?: boolean;
}

const BASE_COLUMNS: readonly Column[] = [
  {
    key: "location",
    label: "Lage",
    render: (record) => record.location,
  },
  {
    key: "municipality",
    label: "Ort",
    render: (record) => record.municipality,
  },
  {
    key: "phase",
    label: "Status",
    render: (record) => (
      <KernBadge
        variant={phaseVariant(record.phase)}
        label={phaseLabel(record.phase)}
      />
    ),
  },
  {
    key: "period",
    label: "Zeitraum",
    render: (record) => formatPeriod(record.startDate, record.endDate),
  },
  {
    key: "category",
    label: "Art",
    render: (record) => categoryLabel(record.category),
  },
  {
    key: "closure",
    label: "Sperrung",
    render: (record) => (
      <KernBadge
        variant={closureVariant(record.closure)}
        label={closureLabel(record.closure)}
      />
    ),
  },
  {
    key: "lastModified",
    label: "Aktualisiert",
    render: (record) => formatTimestamp(record.lastModified),
  },
];

function nextSort(current: BaustellenSort | null, key: BaustellenSortKey) {
  return {
    key,
    direction:
      current?.key === key && current.direction === "ascending"
        ? "descending"
        : "ascending",
  } satisfies BaustellenSort;
}

export function BaustellenTable({
  records,
  currentLocation,
  onShowOnMap,
}: Props) {
  const [sort, setSort] = useState<BaustellenSort | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const effectiveSort =
    sort?.key === "distance" && !currentLocation ? null : sort;

  useEffect(() => {
    if (!currentLocation) {
      setSort((current) => (current?.key === "distance" ? null : current));
    }
  }, [currentLocation]);

  const columns = useMemo<readonly Column[]>(
    () =>
      currentLocation
        ? [
            ...BASE_COLUMNS,
            {
              key: "distance",
              label: "Entfernung (Luftlinie)",
              numeric: true,
              render: (record: Baustelle) =>
                formatDistance(distanceInMeters(currentLocation, record.point)),
            },
          ]
        : BASE_COLUMNS,
    [currentLocation],
  );

  const sortedRecords = useMemo(
    () =>
      effectiveSort
        ? sortBaustellen(records, effectiveSort, currentLocation)
        : sortBaustellenForDisplay(records),
    [currentLocation, effectiveSort, records],
  );

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="baustellen-table kern-table-responsive">
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
                      className="baustellen-table__sort-button"
                      aria-label={`${column.label} ${nextDirection} sortieren`}
                      onClick={() =>
                        setSort((current) => nextSort(current, column.key))
                      }
                    >
                      {column.label}
                      <span
                        className="baustellen-table__sort-icon"
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
            {sortedRecords.map((record) => {
              const isExpanded = expanded.has(record.id);
              return (
                <Fragment key={record.id}>
                  <tr className="kern-table__row">
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`kern-table__cell${
                          column.numeric ? " kern-table__cell--numeric" : ""
                        }`}
                      >
                        {column.render(record)}
                      </td>
                    ))}
                    <td className="kern-table__cell">
                      <div className="baustellen-table__actions">
                        {onShowOnMap && (
                          <button
                            type="button"
                            className="baustellen-table__map-button"
                            onClick={() => onShowOnMap(record.id)}
                          >
                            Auf Karte
                          </button>
                        )}
                        <button
                          type="button"
                          className="baustellen-table__details-button"
                          aria-expanded={isExpanded}
                          aria-controls={`details-${record.id}`}
                          onClick={() => toggleExpanded(record.id)}
                        >
                          {isExpanded ? "Schließen" : "Details"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr
                      key={`${record.id}-details`}
                      id={`details-${record.id}`}
                      className="baustellen-table__details-row"
                    >
                      <td colSpan={columns.length + 1}>
                        <RecordDetails record={record} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="baustellen-cards" aria-label="Baustellenliste">
        {sortedRecords.map((record) => (
          <article className="baustellen-card" key={record.id}>
            <div className="baustellen-card__topline">
              <KernBadge
                variant={phaseVariant(record.phase)}
                label={phaseLabel(record.phase)}
              />
              <KernBadge
                variant={closureVariant(record.closure)}
                label={closureLabel(record.closure)}
              />
            </div>
            <h3 className="baustellen-card__title">{record.location}</h3>
            <p className="baustellen-card__municipality">{record.municipality}</p>
            <dl className="baustellen-card__facts">
              <div>
                <dt>Zeitraum</dt>
                <dd>{formatPeriod(record.startDate, record.endDate)}</dd>
              </div>
              <div>
                <dt>Art</dt>
                <dd>{categoryLabel(record.category)}</dd>
              </div>
              {currentLocation && (
                <div>
                  <dt>Entfernung</dt>
                  <dd>
                    {formatDistance(
                      distanceInMeters(currentLocation, record.point),
                    )}
                  </dd>
                </div>
              )}
            </dl>
            <details className="baustellen-card__details">
              <summary>Weitere Angaben</summary>
              <RecordDetails record={record} />
            </details>
            {onShowOnMap && (
              <button
                type="button"
                className="baustellen-card__map-button"
                onClick={() => onShowOnMap(record.id)}
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

function RecordDetails({ record }: { record: Baustelle }) {
  return (
    <dl className="record-details">
      {record.notes && (
        <div className="record-details__wide">
          <dt>Hinweis</dt>
          <dd>{record.notes}</dd>
        </div>
      )}
      <div>
        <dt>Verantwortlich</dt>
        <dd>{record.cause ?? "Keine Angabe"}</dd>
      </div>
      <div>
        <dt>Datenquelle</dt>
        <dd>{record.source}</dd>
      </div>
      <div>
        <dt>Vorgangsnummer</dt>
        <dd>{record.id}</dd>
      </div>
      <div>
        <dt>Aktualisiert</dt>
        <dd>{formatTimestamp(record.lastModified)}</dd>
      </div>
    </dl>
  );
}
