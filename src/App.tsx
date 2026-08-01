import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KernAlert,
  KernButton,
  KernContainer,
  KernHeading,
  KernKopfzeile,
  KernLink,
  KernLoader,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type { LngLat, NotificationPreferences } from "./types/index.ts";
import {
  countConstructionSitesByPhase,
  type ConstructionSiteFilters,
} from "./lib/construction-site-filter.ts";
import type { ConstructionSiteSort } from "./lib/construction-site-sort.ts";
import {
  DEFAULT_APP_URL_STATE,
  parseAppURLState,
  serializeAppURLState,
  type AppURLState,
  type ConstructionSiteResultView,
} from "./lib/url-state.ts";
import { LEGAL_PAGES, type LegalPageId } from "./lib/legal-pages.ts";
import { UNOFFICIAL_NOTICE } from "./lib/site-operator.ts";
import { formatISOTimestamp } from "./lib/construction-site-labels.ts";
import { ConstructionSiteFilter } from "./components/ConstructionSiteFilter.tsx";
import { LegalPage } from "./components/LegalPage.tsx";
import { ConstructionSiteDetail } from "./components/ConstructionSiteDetail.tsx";
import { ConstructionSiteResults } from "./components/ConstructionSiteResults.tsx";
import { CurrentLocationControl } from "./components/CurrentLocationControl.tsx";
import { ProgressiveWebAppSettings } from "./components/ProgressiveWebAppSettings.tsx";
import {
  useCurrentLocation,
  type CurrentLocationController,
} from "./hooks/useCurrentLocation.ts";
import {
  useConstructionSiteData,
  type ConstructionSiteDataState,
} from "./hooks/useConstructionSiteData.ts";
import { getChangedConstructionSiteIds } from "./lib/construction-site-changes.ts";
import { getBerlinCalendarDate } from "./lib/construction-site-timeframe.ts";
import { useNotificationPreferences } from "./hooks/useNotificationPreferences.ts";
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
  const [legalPageId, setLegalPageId] = useState<LegalPageId | undefined>(
    initialURLState.legalPageId,
  );
  const notificationPreferencesController = useNotificationPreferences();
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
        legalPageId,
      });
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query}${window.location.hash}`,
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [detailSiteId, filters, legalPageId, showOnlyChanged, sort, view]);

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
      setLegalPageId(state.legalPageId);
    };
    window.addEventListener("popstate", restoreURLState);
    return () => window.removeEventListener("popstate", restoreURLState);
  }, []);

  /**
   * A link to the current view with some of its state replaced. Every in-app
   * navigation goes through this, so real `href`s stay correct (middle-click,
   * "open in new tab", copy link) while the click handler keeps the SPA.
   */
  const getAppHref = useCallback(
    (overrides: Partial<AppURLState>) => {
      const query = serializeAppURLState({
        filters,
        showOnlyChanged,
        view,
        sort,
        detailSiteId,
        legalPageId,
        ...overrides,
      });
      return `${window.location.pathname}${query}${window.location.hash}`;
    },
    [detailSiteId, filters, legalPageId, showOnlyChanged, sort, view],
  );

  const getDetailHref = useCallback(
    (siteId: string | undefined) =>
      getAppHref({ detailSiteId: siteId, legalPageId: undefined }),
    [getAppHref],
  );

  const openLegalPage = useCallback(
    (pageId: LegalPageId) => {
      window.history.pushState(
        { faecherbaggerLegalPage: pageId },
        "",
        getAppHref({ legalPageId: pageId, detailSiteId: undefined }),
      );
      setLegalPageId(pageId);
      setDetailSiteId(undefined);
      window.scrollTo({ top: 0 });
    },
    [getAppHref],
  );

  const closeLegalPage = useCallback(() => {
    if (window.history.state?.faecherbaggerLegalPage === legalPageId) {
      window.history.back();
      return;
    }
    window.history.replaceState(
      null,
      "",
      getAppHref({ legalPageId: undefined }),
    );
    setLegalPageId(undefined);
  }, [getAppHref, legalPageId]);

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
    window.history.replaceState(
      null,
      "",
      getAppHref({ view: "map", detailSiteId: undefined }),
    );
    setView("map");
    setDetailSiteId(undefined);
  }, [getAppHref]);

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

  /**
   * Sharing a location is only worth it if the result set reacts: the map zooms
   * to the surroundings (see the map component) and the list switches to
   * "nearest first". An explicit sort choice is respected and left alone.
   */
  const useCurrentLocationForResults = useCallback(async () => {
    await locationController.requestLocation();
    setSort((currentSort) =>
      currentSort ?? { key: "distance", direction: "ascending" },
    );
  }, [locationController]);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Zum Inhalt
      </a>
      <KernKopfzeile label="Fächerbagger · Baustellen in der Region Karlsruhe" />
      <main id="main-content">
        <KernContainer>
          {/*
            KERN is the state's design system, so an app built with it reads as
            an official service. It is not one, and that has to be visible
            without opening the Impressum.
          */}
          <p className="app-unofficial">{UNOFFICIAL_NOTICE}</p>

          {legalPageId ? (
            <LegalPage
              pageId={legalPageId}
              overviewHref={getAppHref({ legalPageId: undefined })}
              onBack={closeLegalPage}
            />
          ) : (
            <ConstructionSitePortal
              constructionSiteData={constructionSiteData}
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
              getDetailHref={getDetailHref}
              onDetailOpen={openSiteDetails}
              onDetailClose={closeSiteDetails}
              onDetailShowOnMap={showSelectedSiteOnMap}
              currentLocation={currentLocation}
              locationController={locationController}
              onUseCurrentLocation={useCurrentLocationForResults}
              notificationPreferences={
                notificationPreferencesController.preferences
              }
              onNotificationPreferencesChange={
                notificationPreferencesController.setPreferences
              }
              getLegalPageHref={(pageId) => getAppHref({ legalPageId: pageId })}
              onLegalPageOpen={openLegalPage}
            />
          )}
        </KernContainer>
      </main>
    </>
  );
}

interface ConstructionSitePortalProps
  extends Omit<
    ConstructionSiteExplorerProps,
    "constructionSites" | "changes" | "metadata"
  > {
  constructionSiteData: ConstructionSiteDataState;
}

/**
 * The portal itself: page bar, load state, and the explorer once data is there.
 * Split from {@link App} so the legal pages can take over the container without
 * carrying any of this along.
 */
function ConstructionSitePortal({
  constructionSiteData,
  ...explorerProps
}: ConstructionSitePortalProps) {
  const {
    detailSiteId,
    locationController,
    onUseCurrentLocation,
    currentLocation,
  } = explorerProps;
  const isDetailView = Boolean(detailSiteId);

  return (
    <>
      <header className="app-bar">
        {/*
          On the detail view the site itself owns the h1, so this generic
          title steps aside rather than competing with it in the outline.
        */}
        {!isDetailView && (
          <div className="app-bar__titles">
            <KernHeading level={1}>Baustellen in der Region Karlsruhe</KernHeading>
            <KernText className="app-bar__intro">
              Aktuelle und geplante Straßenbaustellen finden, vergleichen und
              im Blick behalten.
            </KernText>
          </div>
        )}
        <div className="app-bar__meta">
          {!isDetailView && constructionSiteData.status === "ready" && (
            <KernButton
              type="button"
              className="app-bar__nearby"
              label={
                locationController.locationState.status === "requesting"
                  ? "Standort wird ermittelt …"
                  : currentLocation
                    ? "Umkreis erneut zentrieren"
                    : "Baustellen in meiner Nähe"
              }
              disabled={
                locationController.locationState.status === "requesting"
              }
              onClick={() => {
                // The rail card reports failures through `locationState`.
                void onUseCurrentLocation().catch(() => undefined);
              }}
            />
          )}
          {constructionSiteData.status === "ready" && (
            <DataFreshness fetchedAt={constructionSiteData.metadata.fetchedAt} />
          )}
        </div>
      </header>

      {constructionSiteData.status === "loading" && (
        <div className="app-status" role="status">
          <KernLoader />
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
          {...explorerProps}
        />
      )}
    </>
  );
}

/**
 * The pipeline runs twice a day, so anything older than a day means a run
 * failed. Saying "Stand" next to a green dot in that case is a claim the app
 * cannot back up, so the state is named instead.
 */
const STALE_DATA_AFTER_MS = 26 * 60 * 60 * 1000;

function DataFreshness({ fetchedAt }: { fetchedAt: string }) {
  const isStale = Date.now() - new Date(fetchedAt).getTime() > STALE_DATA_AFTER_MS;
  return (
    <p
      className="app-bar__updated"
      data-state={isStale ? "stale" : "fresh"}
      title={
        isStale
          ? "Die letzte Aktualisierung liegt mehr als einen Tag zurück."
          : undefined
      }
    >
      <span className="app-bar__dot" aria-hidden="true" />
      {isStale ? "Möglicherweise veraltet — Stand " : "Stand "}
      {formatISOTimestamp(fetchedAt)}
    </p>
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
  onUseCurrentLocation: () => Promise<void>;
  notificationPreferences: NotificationPreferences;
  onNotificationPreferencesChange: (
    preferences: NotificationPreferences,
  ) => void;
  getLegalPageHref: (pageId: LegalPageId) => string;
  onLegalPageOpen: (pageId: LegalPageId) => void;
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
  onUseCurrentLocation,
  notificationPreferences,
  onNotificationPreferencesChange,
  getLegalPageHref,
  onLegalPageOpen,
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
  const today = useMemo(() => getBerlinCalendarDate(), []);
  const phaseCounts = useMemo(
    () => countConstructionSitesByPhase(scopedConstructionSites, filters, today),
    [filters, scopedConstructionSites, today],
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
            <CurrentLocationControl
              locationController={locationController}
              onUseCurrentLocation={onUseCurrentLocation}
            />
            <ProgressiveWebAppSettings
              locationController={locationController}
              preferences={notificationPreferences}
              onPreferencesChange={onNotificationPreferencesChange}
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
          notificationAreas={notificationPreferences.areas}
        />
      </div>

      <footer className="app-footer">
        {/*
          Attribution, the disclaimer and the legal links stay visible: a site
          that tells people which roads are closed has to say where the data
          comes from and that it is not a binding statement.
        */}
        <p className="app-footer__disclaimer">
          Angaben ohne Gewähr und ohne Rechtsverbindlichkeit. Maßgeblich sind
          die Anordnungen und Beschilderungen vor Ort.
        </p>
        <KernText muted className="app-footer__source">
          Daten: {metadata.source.name} · Quellen:{" "}
          {metadata.attribution.join(", ")} · Stand:{" "}
          {formatISOTimestamp(metadata.fetchedAt)}
        </KernText>
        <ul className="app-footer__links">
          <li>
            <KernLink
              href="https://mobil.trk.de/"
              label="Mobilitätsportal der TRK"
            />
          </li>
          <li>
            <KernLink
              href={`${import.meta.env.BASE_URL}baustellen.xml`}
              label="RSS-Feed"
            />
          </li>
          <li>
            <KernLink
              href={`${import.meta.env.BASE_URL}baustellen.atom`}
              label="Atom-Feed"
            />
          </li>
          {LEGAL_PAGES.map((page) => (
            <li key={page.id}>
              {/*
                A real href, so these pages can be linked to and opened in a new
                tab; the handler keeps an in-app click from reloading everything.
              */}
              <a
                href={getLegalPageHref(page.id)}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onLegalPageOpen(page.id);
                }}
              >
                {page.title}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </>
  );
}
