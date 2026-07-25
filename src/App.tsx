import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KernAlert,
  KernContainer,
  KernHeading,
  KernKopfzeile,
  KernLink,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type { LngLat, NotificationArea } from "./types/index.ts";
import {
  countConstructionSitesByPhase,
  type ConstructionSiteFilters,
} from "./lib/construction-site-filter.ts";
import type { ConstructionSiteSort } from "./lib/construction-site-sort.ts";
import {
  DEFAULT_APP_URL_STATE,
  parseAppURLState,
  serializeAppURLState,
  type ConstructionSiteResultView,
} from "./lib/url-state.ts";
import { ConstructionSiteFilter } from "./components/ConstructionSiteFilter.tsx";
import { ConstructionSiteDetail } from "./components/ConstructionSiteDetail.tsx";
import { ConstructionSiteResults } from "./components/ConstructionSiteResults.tsx";
import { CurrentLocationControl } from "./components/CurrentLocationControl.tsx";
import { ProgressiveWebAppSettings } from "./components/ProgressiveWebAppSettings.tsx";
import {
  useCurrentLocation,
  type CurrentLocationController,
} from "./hooks/useCurrentLocation.ts";
import { useConstructionSiteData } from "./hooks/useConstructionSiteData.ts";
import { getChangedConstructionSiteIds } from "./lib/construction-site-changes.ts";
import {
  loadNotificationArea,
  saveNotificationArea,
} from "./lib/notification-area.ts";
import "./App.css";

/**
 * Page shell: owns the shareable view state (filters, scope, presentation,
 * sort, detail) and arranges the control rail beside the results.
 */
export function App() {
  const constructionSiteData = useConstructionSiteData();
  const initialURLState = useMemo(
    () => parseAppURLState(window.location.search),
    [],
  );

  const [filters, setFilters] = useState<ConstructionSiteFilters>(
    initialURLState.filters,
  );
  const [showOnlyChanged, setShowOnlyChanged] = useState(
    initialURLState.showOnlyChanged,
  );
  const [view, setView] = useState<ConstructionSiteResultView>(
    initialURLState.view,
  );
  const [sort, setSort] = useState<ConstructionSiteSort | null>(
    initialURLState.sort,
  );
  const [detailSiteId, setDetailSiteId] = useState<string | undefined>(
    initialURLState.detailSiteId,
  );
  const [notificationArea, setNotificationArea] =
    useState<NotificationArea | null>(loadNotificationArea);
  const locationController = useCurrentLocation();

  // Keep the address bar in step with the view so it can be shared or reloaded.
  // `replaceState` keeps typing out of the history stack; the delay keeps a
  // fast typist under the browsers' rate limit for history updates.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = serializeAppURLState({
        filters,
        showOnlyChanged,
        view,
        sort,
        detailSiteId,
      });
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query}${window.location.hash}`,
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [detailSiteId, filters, showOnlyChanged, sort, view]);

  // Detail links use the History API so Back/Forward restores the complete
  // overview state without a full application reload.
  useEffect(() => {
    const restoreURLState = () => {
      const state = parseAppURLState(window.location.search);
      setFilters(state.filters);
      setShowOnlyChanged(state.showOnlyChanged);
      setView(state.view);
      setSort(state.sort);
      setDetailSiteId(state.detailSiteId);
    };
    window.addEventListener("popstate", restoreURLState);
    return () => window.removeEventListener("popstate", restoreURLState);
  }, []);

  const getDetailHref = useCallback(
    (siteId: string | undefined) => {
      const query = serializeAppURLState({
        filters,
        showOnlyChanged,
        view,
        sort,
        detailSiteId: siteId,
      });
      return `${window.location.pathname}${query}${window.location.hash}`;
    },
    [filters, showOnlyChanged, sort, view],
  );

  const openSiteDetails = useCallback(
    (siteId: string) => {
      window.history.pushState(
        { faecherbaggerDetail: siteId },
        "",
        getDetailHref(siteId),
      );
      setDetailSiteId(siteId);
    },
    [getDetailHref],
  );

  const closeSiteDetails = useCallback(() => {
    if (window.history.state?.faecherbaggerDetail === detailSiteId) {
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", getDetailHref(undefined));
    setDetailSiteId(undefined);
  }, [getDetailHref, detailSiteId]);

  const showSelectedSiteOnMap = useCallback(() => {
    const query = serializeAppURLState({
      filters,
      showOnlyChanged,
      view: "map",
      sort,
      detailSiteId: undefined,
    });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query}${window.location.hash}`,
    );
    setView("map");
    setDetailSiteId(undefined);
  }, [filters, showOnlyChanged, sort]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      event.preventDefault();
      document.querySelector<HTMLInputElement>("#filter-search")?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_APP_URL_STATE.filters);
    setShowOnlyChanged(false);
  }, []);

  const currentLocation =
    locationController.locationState.status === "ready"
      ? locationController.locationState.point
      : undefined;

  return (
    <>
      <a className="skip-link" href="#main-content">
        Zum Inhalt
      </a>
      <KernKopfzeile label="Fächerbagger · Baustellenportal" />
      <main id="main-content">
        <KernContainer>
          <header className="app-bar">
            <div className="app-bar__titles">
              <KernHeading level={1}>Baustellen in der Region Karlsruhe</KernHeading>
              <KernText className="app-bar__intro">
                Aktuelle und geplante Straßenbaustellen finden, vergleichen und
                im Blick behalten.
              </KernText>
            </div>
            {constructionSiteData.status === "ready" && (
              <p className="app-bar__updated">
                <span className="app-bar__dot" aria-hidden="true" />
                Stand{" "}
                {new Date(
                  constructionSiteData.metadata.fetchedAt,
                ).toLocaleString("de-DE", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            )}
          </header>

          {constructionSiteData.status === "loading" && (
            <div className="app-status" role="status" aria-live="polite">
              <span className="app-status__spinner" aria-hidden="true" />
              <KernText>Daten werden geladen …</KernText>
            </div>
          )}

          {constructionSiteData.status === "error" && (
            <KernAlert variant="warning" title="Daten noch nicht verfügbar">
              <KernText>
                Die Baustellendaten konnten nicht geladen werden. Versuchen Sie
                es später erneut. ({constructionSiteData.message})
              </KernText>
            </KernAlert>
          )}

          {constructionSiteData.status === "ready" && (
            <ConstructionSiteExplorer
              constructionSites={constructionSiteData.constructionSites}
              changes={constructionSiteData.changes}
              metadata={constructionSiteData.metadata}
              filters={filters}
              onFiltersChange={setFilters}
              onFiltersReset={resetFilters}
              showOnlyChanged={showOnlyChanged}
              onShowOnlyChangedChange={setShowOnlyChanged}
              view={view}
              onViewChange={setView}
              sort={sort}
              onSortChange={setSort}
              detailSiteId={detailSiteId}
              getDetailHref={(siteId) => getDetailHref(siteId)}
              onDetailOpen={openSiteDetails}
              onDetailClose={closeSiteDetails}
              onDetailShowOnMap={showSelectedSiteOnMap}
              currentLocation={currentLocation}
              locationController={locationController}
              notificationArea={notificationArea}
              onNotificationAreaChange={(area) => {
                saveNotificationArea(area);
                setNotificationArea(area);
              }}
            />
          )}
        </KernContainer>
      </main>
    </>
  );
}

type LoadedConstructionSiteData = Extract<
  ReturnType<typeof useConstructionSiteData>,
  { status: "ready" }
>;

interface ConstructionSiteExplorerProps
  extends Pick<
    LoadedConstructionSiteData,
    "constructionSites" | "changes" | "metadata"
  > {
  filters: ConstructionSiteFilters;
  onFiltersChange: (filters: ConstructionSiteFilters) => void;
  onFiltersReset: () => void;
  showOnlyChanged: boolean;
  onShowOnlyChangedChange: (showOnlyChanged: boolean) => void;
  view: ConstructionSiteResultView;
  onViewChange: (view: ConstructionSiteResultView) => void;
  sort: ConstructionSiteSort | null;
  onSortChange: (sort: ConstructionSiteSort | null) => void;
  detailSiteId?: string;
  getDetailHref: (siteId: string | undefined) => string;
  onDetailOpen: (siteId: string) => void;
  onDetailClose: () => void;
  onDetailShowOnMap: () => void;
  currentLocation?: LngLat;
  locationController: CurrentLocationController;
  notificationArea: NotificationArea | null;
  onNotificationAreaChange: (area: NotificationArea) => void;
}

/**
 * The loaded page: a persistent control rail beside the results. Split out so
 * the derived counts are only computed once data is available.
 */
function ConstructionSiteExplorer({
  constructionSites,
  changes,
  metadata,
  filters,
  onFiltersChange,
  onFiltersReset,
  showOnlyChanged,
  onShowOnlyChangedChange,
  view,
  onViewChange,
  sort,
  onSortChange,
  detailSiteId,
  getDetailHref,
  onDetailOpen,
  onDetailClose,
  onDetailShowOnMap,
  currentLocation,
  locationController,
  notificationArea,
  onNotificationAreaChange,
}: ConstructionSiteExplorerProps) {
  const [mapSelectedSiteId, setMapSelectedSiteId] = useState<
    string | undefined
  >();
  const changedSiteIds = useMemo(
    () => getChangedConstructionSiteIds(changes),
    [changes],
  );
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
  const detailSite = detailSiteId
    ? constructionSites.find((site) => site.id === detailSiteId)
    : undefined;

  if (detailSiteId) {
    return detailSite ? (
      <ConstructionSiteDetail
        site={detailSite}
        overviewHref={getDetailHref(undefined)}
        onBack={onDetailClose}
        onShowOnMap={() => {
          setMapSelectedSiteId(detailSite.id);
          onDetailShowOnMap();
        }}
      />
    ) : (
      <KernAlert variant="warning" title="Baustelle nicht gefunden">
        <KernText>
          Die verlinkte Baustelle ist im aktuellen Datenstand nicht enthalten.
        </KernText>
        <a
          href={getDetailHref(undefined)}
          onClick={(event) => {
            event.preventDefault();
            onDetailClose();
          }}
        >
          Zur Baustellenübersicht
        </a>
      </KernAlert>
    );
  }

  return (
    <>
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
            <ProgressiveWebAppSettings
              locationController={locationController}
              notificationArea={notificationArea}
              onNotificationAreaChange={onNotificationAreaChange}
            />
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
          selectedSiteId={mapSelectedSiteId}
          onSelectedSiteIdChange={setMapSelectedSiteId}
          getDetailHref={getDetailHref}
          onDetailOpen={onDetailOpen}
          currentLocation={currentLocation}
          notificationArea={notificationArea ?? undefined}
        />
      </div>

      <footer className="app-footer">
        <details className="kern-accordion app-footer__details">
          <summary className="kern-accordion__header">
            <span className="kern-title">Datenquelle und Hinweise</span>
          </summary>
          <section className="kern-accordion__body">
            <KernText>
              Daten: {metadata.source.name}. Quellen:{" "}
              {metadata.attribution.join(", ")}. Letzte Aktualisierung:{" "}
              {new Date(metadata.fetchedAt).toLocaleString("de-DE")}.
            </KernText>
            <KernLink
              href="https://mobil.trk.de/"
              label="Zum Mobilitätsportal der TRK"
            />
            {" · "}
            <KernLink
              href={`${import.meta.env.BASE_URL}baustellen.xml`}
              label="RSS-Feed abonnieren"
            />
            {" · "}
            <KernLink
              href={`${import.meta.env.BASE_URL}baustellen.atom`}
              label="Atom-Feed abonnieren"
            />
          </section>
        </details>
      </footer>
    </>
  );
}
