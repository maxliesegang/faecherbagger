import { useMemo } from "react";
import { useDataset } from "../context/DatasetContext.tsx";
import { usePersonal } from "../context/PersonalContext.tsx";
import { useView } from "../context/ViewContext.tsx";
import { selectSites } from "../lib/select-sites.ts";
import { createRegionScope } from "../lib/site-scope.ts";
import { ConstructionSiteFilter } from "./ConstructionSiteFilter.tsx";
import { ConstructionSiteResults } from "./ConstructionSiteResults.tsx";
import { CurrentLocationControl } from "./CurrentLocationControl.tsx";
import "./ConstructionSiteExplorer.css";

/**
 * The secondary screen: search across the whole region. A persistent control
 * rail (search, status, detail filters, location) beside the map or list.
 *
 * Everything the rail and the results need comes from one {@link selectSites}
 * call, so the counts on the filter panel and the rows in the list cannot
 * describe different sets.
 */
export function ConstructionSiteExplorer() {
  const { constructionSites } = useDataset();
  const { seenAt } = usePersonal();
  const {
    recentWindow,
    query,
    setFilters,
    setOnlyRecent,
    setWindowDays,
    resetQuery,
  } = useView();

  const selection = useMemo(
    () =>
      selectSites(
        constructionSites,
        createRegionScope(query, recentWindow),
        seenAt,
      ),
    [constructionSites, query, recentWindow, seenAt],
  );

  return (
    <div className="app-shell">
      <div className="app-rail">
        <ConstructionSiteFilter
          constructionSites={constructionSites}
          filters={query.filters}
          phaseCounts={selection.phaseCounts}
          showOnlyNew={query.onlyRecent}
          recentCount={selection.recentTotal}
          recentWindowDays={recentWindow.days}
          onWindowDaysChange={setWindowDays}
          onFiltersChange={setFilters}
          onShowOnlyNewChange={setOnlyRecent}
          onFiltersReset={resetQuery}
        />

        <div className="app-rail__tools" aria-label="Persönliche Werkzeuge">
          <CurrentLocationControl />
        </div>
      </div>

      <ConstructionSiteResults
        selection={selection}
        totalCount={constructionSites.length}
      />
    </div>
  );
}
