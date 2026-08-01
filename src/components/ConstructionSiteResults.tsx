import { lazy, Suspense, useMemo, useRef } from "react";
import {
  KernAlert,
  KernHeading,
  KernLoader,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
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
import { getBerlinCalendarDate } from "../lib/construction-site-timeframe.ts";
import type { ConstructionSiteResultView } from "../lib/url-state.ts";
import { useDebouncedValue } from "../hooks/useDebouncedValue.ts";
import { useResultLayout } from "../hooks/useResultLayout.ts";
import { ConstructionSiteTable } from "./ConstructionSiteTable.tsx";

const ConstructionSiteMap = lazy(() =>
  import("./ConstructionSiteMap.tsx").then((module) => ({
    default: module.ConstructionSiteMap,
  })),
);

/** Long enough that typing a word produces one announcement, not eight. */
const RESULT_COUNT_ANNOUNCEMENT_DELAY_MS = 700;

const RESULT_VIEW_OPTIONS: readonly {
  value: ConstructionSiteResultView;
  label: string;
}[] = [
  { value: "map", label: "Karte" },
  { value: "list", label: "Liste" },
];

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
  notificationAreas: readonly NotificationArea[];
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
  notificationAreas,
}: ConstructionSiteResultsProps) {
  // One reference date per mount keeps the timeframe windows stable while the
  // visitor works, and keeps them identical to the counts on the filter card.
  const resultsRef = useRef<HTMLElement>(null);
  const layout = useResultLayout(resultsRef);
  const today = useMemo(() => getBerlinCalendarDate(), []);
  const filteredConstructionSites = useMemo(
    () => filterConstructionSites(constructionSites, filters, today),
    [constructionSites, filters, today],
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

  const resultCountSuffix = `${
    displayedConstructionSites.length === constructionSites.length
      ? " Baustellen"
      : ` von ${constructionSites.length} Baustellen`
  }${showOnlyChanged ? " · neu oder geändert" : ""}`;
  const announcedResultCount = useDebouncedValue(
    `${displayedConstructionSites.length}${resultCountSuffix}`,
    RESULT_COUNT_ANNOUNCEMENT_DELAY_MS,
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
    <section
      className="results"
      aria-labelledby="results-heading"
      ref={resultsRef}
    >
      <div className="results__toolbar">
        <KernHeading level={2} id="results-heading" className="kern-sr-only">
          Ergebnisse
        </KernHeading>
        <p className="results__count">
          <strong>{displayedConstructionSites.length}</strong>
          {resultCountSuffix}
        </p>
        {/*
          Announced separately and only once typing stops: an `aria-live` count
          on the element itself fires on every keystroke of the search field.
        */}
        <p className="kern-sr-only" aria-live="polite" aria-atomic="true">
          {announcedResultCount}
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

          {/*
            Native radios rather than KERN's tab set: the choice has to be
            restorable from the URL, and `KernTabs` owns its active index
            internally and would also mount both panels, defeating the map's
            lazy import.
          */}
          <fieldset className="view-switcher">
            <legend className="kern-sr-only">Darstellung wählen</legend>
            {RESULT_VIEW_OPTIONS.map((option) => (
              <label key={option.value} className="view-switcher__item">
                <input
                  className="view-switcher__input kern-sr-only"
                  type="radio"
                  name="results-view"
                  value={option.value}
                  checked={view === option.value}
                  onChange={() => onViewChange(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </div>
      </div>

      {showOnlyChanged && changes.since !== null && (
        <KernText muted className="results__change-summary">
          Seit {new Date(changes.since).toLocaleString("de-DE")}:{" "}
          {changes.added.length} neu, {changes.modified.length} geändert
          {changes.removed.length > 0 &&
            `, ${changes.removed.length} nicht mehr gelistet`}
          .
        </KernText>
      )}

      {sortedConstructionSites.length > 0 ? (
        view === "map" ? (
          <Suspense
            fallback={
              <div className="app-status app-status--map" role="status">
                <KernLoader />
                <KernText>Karte wird geladen …</KernText>
              </div>
            }
          >
            {/* The map is order-independent; passing the unsorted set keeps
                a sort change from rebuilding its sources and refitting. */}
            <ConstructionSiteMap
              constructionSites={displayedConstructionSites}
              selectedSiteId={selectedSiteId}
              currentLocation={currentLocation}
              notificationAreas={notificationAreas}
              onSiteSelect={onSelectedSiteIdChange}
              getSiteDetailsHref={getDetailHref}
              onSiteDetailsRequest={onDetailOpen}
              onListViewRequest={() => onViewChange("list")}
            />
          </Suspense>
        ) : (
          <ConstructionSiteTable
            constructionSites={sortedConstructionSites}
            layout={layout}
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
                ? "Seit der vorherigen Aktualisierung gibt es für die gewählten Filter keine Änderungen."
                : "Ändern Sie Ihre Suche oder löschen Sie die gewählten Filter."}
          </KernText>
        </KernAlert>
      )}
    </section>
  );
}
