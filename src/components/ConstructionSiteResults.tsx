import { useMemo } from "react";
import { KernAlert, KernHeading, KernText } from "@kern-ux-annex/kern-react-kit";
import { usePersonal } from "../context/PersonalContext.tsx";
import { useView } from "../context/ViewContext.tsx";
import type { ConstructionSiteSelection } from "../lib/select-construction-sites.ts";
import {
  CONSTRUCTION_SITE_SORT_PRESETS,
  serializeConstructionSiteSort,
  parseConstructionSiteSort,
  sortConstructionSitesBy,
  sortConstructionSitesByDefaultOrder,
} from "../lib/construction-site-sort.ts";
import { getRecentWindowLabel } from "../shared/construction-site-labels.ts";
import { ConstructionSiteTable } from "./ConstructionSiteTable.tsx";
import { LazyConstructionSiteMap } from "./LazyConstructionSiteMap.tsx";
import "./ConstructionSiteResults.css";

interface ConstructionSiteResultsProps {
  /** Already scoped and filtered upstream; this component only orders it. */
  selection: ConstructionSiteSelection;
  /** Size of the unscoped dataset, for the "N von M" count. */
  totalCount: number;
}

/**
 * The result column: one compact toolbar (count, sort, presentation) above the
 * map or the list. Sorting lives here rather than in the table so the card view
 * and the map-to-list handoff share the same order.
 */
export function ConstructionSiteResults({
  selection,
  totalCount,
}: ConstructionSiteResultsProps) {
  const { currentLocation, area } = usePersonal();
  const {
    recentWindow,
    query,
    view,
    setView,
    sort,
    setSort,
    mapSelectedConstructionSiteId,
    setMapSelectedConstructionSiteId,
    getConstructionSiteDetailHref,
    openConstructionSiteDetail,
  } = useView();
  const { since, days: recentWindowDays } = recentWindow;
  const showOnlyNew = query.onlyRecent;
  const homeArea = area ?? undefined;
  const displayedConstructionSites = useMemo(
    () => selection.visible.map((entry) => entry.constructionSite),
    [selection.visible],
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
          {displayedConstructionSites.length === totalCount
            ? " Baustellen"
            : ` von ${totalCount} Baustellen`}
          {showOnlyNew && " · neu"}
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
                  setSort(parseConstructionSiteSort(event.target.value))
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
              onClick={() => setView("map")}
            >
              Karte
            </button>
            <button
              type="button"
              className="view-switcher__button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              Liste
            </button>
          </div>
        </div>
      </div>

      {showOnlyNew && (
        <KernText muted className="results__change-summary">
          Baustellen, die seit {new Date(since).toLocaleString("de-DE")} neu
          hinzugekommen sind.
        </KernText>
      )}

      {sortedConstructionSites.length > 0 ? (
        view === "map" ? (
          /* The map is order-independent; passing the unsorted set keeps a
             sort change from rebuilding its sources and refitting. */
          <LazyConstructionSiteMap
            constructionSites={displayedConstructionSites}
            selectedConstructionSiteId={mapSelectedConstructionSiteId}
            currentLocation={currentLocation}
            homeArea={homeArea}
            onSelectedConstructionSiteIdChange={setMapSelectedConstructionSiteId}
            getConstructionSiteDetailHref={getConstructionSiteDetailHref}
            onOpenConstructionSiteDetail={openConstructionSiteDetail}
            onShowList={() => setView("list")}
          />
        ) : (
          <ConstructionSiteTable
            constructionSites={sortedConstructionSites}
            sort={effectiveSort}
            onSortChange={setSort}
            currentLocation={currentLocation}
            getConstructionSiteDetailHref={getConstructionSiteDetailHref}
            onOpenConstructionSiteDetail={openConstructionSiteDetail}
            onShowConstructionSiteOnMap={(constructionSiteId) => {
              setMapSelectedConstructionSiteId(constructionSiteId);
              setView("map");
            }}
          />
        )
      ) : (
        <KernAlert
          variant="info"
          title={
            showOnlyNew
              ? "Keine neuen Baustellen"
              : "Keine passenden Baustellen"
          }
        >
          <KernText>
            {showOnlyNew
              ? `In den letzten ${getRecentWindowLabel(recentWindowDays)} ist für die gewählten Filter keine Baustelle dazugekommen.`
              : "Ändern Sie Ihre Suche oder löschen Sie die gewählten Filter."}
          </KernText>
        </KernAlert>
      )}
    </section>
  );
}
