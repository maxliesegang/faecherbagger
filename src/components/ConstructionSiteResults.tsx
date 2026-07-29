import { useMemo } from "react";
import { KernAlert, KernHeading, KernText } from "@kern-ux-annex/kern-react-kit";
import type {
  ConstructionSite,
  ConstructionSiteChanges,
  LngLat,
  NotificationArea,
} from "../types/index.ts";
import {
  filterConstructionSites,
  type ConstructionSiteFilters,
} from "../lib/construction-site-filter.ts";
import {
  CONSTRUCTION_SITE_SORT_PRESETS,
  serializeConstructionSiteSort,
  parseConstructionSiteSort,
  sortConstructionSitesBy,
  sortConstructionSitesByDefaultOrder,
  type ConstructionSiteSort,
} from "../lib/construction-site-sort.ts";
import type { ConstructionSiteResultView } from "../lib/url-state.ts";
import { CHANGES_RETENTION_DAYS } from "../lib/construction-site-changes.ts";
import { ConstructionSiteTable } from "./ConstructionSiteTable.tsx";
import { LazyConstructionSiteMap } from "./LazyConstructionSiteMap.tsx";

interface ConstructionSiteResultsProps {
  constructionSites: readonly ConstructionSite[];
  changes: Readonly<ConstructionSiteChanges>;
  changedSiteIds: ReadonlySet<string>;
  filters: Readonly<ConstructionSiteFilters>;
  showOnlyChanged: boolean;
  view: ConstructionSiteResultView;
  onViewChange: (view: ConstructionSiteResultView) => void;
  sort: ConstructionSiteSort | null;
  onSortChange: (sort: ConstructionSiteSort | null) => void;
  selectedSiteId?: string;
  onSelectedSiteIdChange: (siteId: string | undefined) => void;
  getDetailHref: (siteId: string) => string;
  onDetailOpen: (siteId: string) => void;
  currentLocation?: LngLat;
  notificationArea?: NotificationArea;
}

/**
 * The result column: one compact toolbar (count, sort, presentation) above the
 * map or the list. Sorting lives here rather than in the table so the card view
 * and the map-to-list handoff share the same order.
 */
export function ConstructionSiteResults({
  constructionSites,
  changes,
  changedSiteIds,
  filters,
  showOnlyChanged,
  view,
  onViewChange,
  sort,
  onSortChange,
  selectedSiteId,
  onSelectedSiteIdChange,
  getDetailHref,
  onDetailOpen,
  currentLocation,
  notificationArea,
}: ConstructionSiteResultsProps) {
  const filteredConstructionSites = useMemo(
    () => filterConstructionSites(constructionSites, filters),
    [constructionSites, filters],
  );
  const displayedConstructionSites = useMemo(
    () =>
      showOnlyChanged
        ? filteredConstructionSites.filter((site) => changedSiteIds.has(site.id))
        : filteredConstructionSites,
    [changedSiteIds, filteredConstructionSites, showOnlyChanged],
  );

  // A distance sort is meaningless without a location, so fall back silently
  // when the user withdraws it instead of showing an arbitrary order.
  const effectiveSort =
    sort?.key === "distance" && !currentLocation ? null : sort;
  const sortedConstructionSites = useMemo(
    () =>
      effectiveSort
        ? sortConstructionSitesBy(
            displayedConstructionSites,
            effectiveSort,
            currentLocation,
          )
        : sortConstructionSitesByDefaultOrder(displayedConstructionSites),
    [currentLocation, displayedConstructionSites, effectiveSort],
  );

  const sortPresets = CONSTRUCTION_SITE_SORT_PRESETS.filter(
    (preset) => !preset.needsLocation || currentLocation,
  );
  const sortValue = serializeConstructionSiteSort(effectiveSort);
  const isCustomSort =
    sortValue !== "" &&
    !sortPresets.some(
      (preset) => serializeConstructionSiteSort(preset.sort) === sortValue,
    );

  return (
    <section className="results" aria-labelledby="results-heading">
      <div className="results__toolbar">
        <KernHeading level={2} id="results-heading" className="kern-sr-only">
          Ergebnisse
        </KernHeading>
        <p className="results__count" aria-live="polite" aria-atomic="true">
          <strong>{displayedConstructionSites.length}</strong>
          {displayedConstructionSites.length === constructionSites.length
            ? " Baustellen"
            : ` von ${constructionSites.length} Baustellen`}
          {showOnlyChanged && " · neu oder geändert"}
        </p>

        <div className="results__controls">
          <div className="results__sort">
            <label htmlFor="results-sort" className="kern-label">
              Sortierung
            </label>
            <div className="kern-form-input__select-wrapper">
              <select
                id="results-sort"
                className="kern-form-input__select"
                value={sortValue}
                onChange={(event) =>
                  onSortChange(parseConstructionSiteSort(event.target.value))
                }
              >
                {isCustomSort && (
                  <option value={sortValue}>Eigene Sortierung</option>
                )}
                {sortPresets.map((preset) => (
                  <option
                    key={serializeConstructionSiteSort(preset.sort)}
                    value={serializeConstructionSiteSort(preset.sort)}
                  >
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            className="view-switcher"
            role="group"
            aria-label="Darstellung wählen"
          >
            <button
              type="button"
              className="view-switcher__button"
              aria-pressed={view === "map"}
              onClick={() => onViewChange("map")}
            >
              Karte
            </button>
            <button
              type="button"
              className="view-switcher__button"
              aria-pressed={view === "list"}
              onClick={() => onViewChange("list")}
            >
              Liste
            </button>
          </div>
        </div>
      </div>

      {showOnlyChanged && changes.since !== null && (
        <KernText muted className="results__change-summary">
          Letzte {CHANGES_RETENTION_DAYS} Tage (seit{" "}
          {new Date(changes.since).toLocaleString("de-DE")})
          : {changes.added.length} neu, {changes.modified.length} geändert
          {changes.removed.length > 0 &&
            `, ${changes.removed.length} nicht mehr gelistet`}
          .
        </KernText>
      )}

      {sortedConstructionSites.length > 0 ? (
        view === "map" ? (
          /* The map is order-independent; passing the unsorted set keeps a
             sort change from rebuilding its sources and refitting. */
          <LazyConstructionSiteMap
            constructionSites={displayedConstructionSites}
            selectedSiteId={selectedSiteId}
            currentLocation={currentLocation}
            notificationArea={notificationArea}
            onSiteSelect={onSelectedSiteIdChange}
            getSiteDetailsHref={getDetailHref}
            onSiteDetailsRequest={onDetailOpen}
            onListViewRequest={() => onViewChange("list")}
          />
        ) : (
          <ConstructionSiteTable
            constructionSites={sortedConstructionSites}
            sort={effectiveSort}
            onSortChange={onSortChange}
            currentLocation={currentLocation}
            getSiteDetailsHref={getDetailHref}
            onShowSiteDetails={onDetailOpen}
            onShowSiteOnMap={(siteId) => {
              onSelectedSiteIdChange(siteId);
              onViewChange("map");
            }}
          />
        )
      ) : (
        <KernAlert
          variant="info"
          title={
            showOnlyChanged
              ? "Keine neuen oder geänderten Baustellen"
              : "Keine passenden Baustellen"
          }
        >
          <KernText>
            {showOnlyChanged && changes.since === null
              ? "Für diesen Datenstand liegt noch kein vorheriger Vergleich vor."
              : showOnlyChanged
                ? `In den letzten ${CHANGES_RETENTION_DAYS} Tagen gibt es für die gewählten Filter keine Änderungen.`
                : "Ändern Sie Ihre Suche oder löschen Sie die gewählten Filter."}
          </KernText>
        </KernAlert>
      )}
    </section>
  );
}
