import { useMemo } from "react";
import type {
  ConstructionSite,
  ConstructionSiteChanges,
  LngLat,
  NotificationArea,
} from "../types/index.ts";
import {
  countConstructionSitesByPhase,
  type ConstructionSiteFilters,
} from "../lib/construction-site-filter.ts";
import type { ConstructionSiteSort } from "../lib/construction-site-sort.ts";
import type { ConstructionSiteResultView } from "../lib/url-state.ts";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";
import { ConstructionSiteFilter } from "./ConstructionSiteFilter.tsx";
import { ConstructionSiteResults } from "./ConstructionSiteResults.tsx";
import { CurrentLocationControl } from "./CurrentLocationControl.tsx";

interface ConstructionSiteExplorerProps {
  constructionSites: readonly ConstructionSite[];
  changes: Readonly<ConstructionSiteChanges>;
  /** Ids in the change window; computed once by the page and shared. */
  changedSiteIds: ReadonlySet<string>;
  filters: ConstructionSiteFilters;
  onFiltersChange: (filters: ConstructionSiteFilters) => void;
  onFiltersReset: () => void;
  showOnlyChanged: boolean;
  onShowOnlyChangedChange: (showOnlyChanged: boolean) => void;
  view: ConstructionSiteResultView;
  onViewChange: (view: ConstructionSiteResultView) => void;
  sort: ConstructionSiteSort | null;
  onSortChange: (sort: ConstructionSiteSort | null) => void;
  selectedSiteId?: string;
  onSelectedSiteIdChange: (siteId: string | undefined) => void;
  getDetailHref: (siteId: string) => string;
  onDetailOpen: (siteId: string) => void;
  locationController: CurrentLocationController;
  currentLocation?: LngLat;
  notificationArea?: NotificationArea;
}

/**
 * The secondary screen: search across the whole region. A persistent control
 * rail (search, status, detail filters, location) beside the map or list.
 */
export function ConstructionSiteExplorer({
  constructionSites,
  changes,
  changedSiteIds,
  filters,
  onFiltersChange,
  onFiltersReset,
  showOnlyChanged,
  onShowOnlyChangedChange,
  view,
  onViewChange,
  sort,
  onSortChange,
  selectedSiteId,
  onSelectedSiteIdChange,
  getDetailHref,
  onDetailOpen,
  locationController,
  currentLocation,
  notificationArea,
}: ConstructionSiteExplorerProps) {
  // The status counts have to respect the change scope, otherwise the tiles
  // would advertise more matches than the result list can show.
  const scopedConstructionSites = useMemo(
    () =>
      showOnlyChanged
        ? constructionSites.filter((site) => changedSiteIds.has(site.id))
        : constructionSites,
    [changedSiteIds, constructionSites, showOnlyChanged],
  );
  const phaseCounts = useMemo(
    () => countConstructionSitesByPhase(scopedConstructionSites, filters),
    [filters, scopedConstructionSites],
  );

  return (
    <div className="app-shell">
      <div className="app-rail">
        <ConstructionSiteFilter
          constructionSites={constructionSites}
          filters={filters}
          phaseCounts={phaseCounts}
          showOnlyChanged={showOnlyChanged}
          changedCount={changedSiteIds.size}
          onFiltersChange={onFiltersChange}
          onShowOnlyChangedChange={onShowOnlyChangedChange}
          onFiltersReset={onFiltersReset}
        />

        <div className="app-rail__tools" aria-label="Persönliche Werkzeuge">
          <CurrentLocationControl locationController={locationController} />
        </div>
      </div>

      <ConstructionSiteResults
        constructionSites={constructionSites}
        changes={changes}
        changedSiteIds={changedSiteIds}
        filters={filters}
        showOnlyChanged={showOnlyChanged}
        view={view}
        onViewChange={onViewChange}
        sort={sort}
        onSortChange={onSortChange}
        selectedSiteId={selectedSiteId}
        onSelectedSiteIdChange={onSelectedSiteIdChange}
        getDetailHref={getDetailHref}
        onDetailOpen={onDetailOpen}
        currentLocation={currentLocation}
        notificationArea={notificationArea}
      />
    </div>
  );
}
