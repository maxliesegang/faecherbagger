import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KernAlert,
  KernContainer,
  KernHeading,
  KernKopfzeile,
  KernLink,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type { ConstructionSite, NotificationArea } from "./types/index.ts";
import type { ConstructionSiteFilters } from "./lib/construction-site-filter.ts";
import type { ConstructionSiteSort } from "./lib/construction-site-sort.ts";
import {
  DEFAULT_APP_URL_STATE,
  parseAppURLState,
  serializeAppURLState,
  type AppSection,
  type AppURLState,
  type ConstructionSiteResultView,
} from "./lib/url-state.ts";
import { getChangedConstructionSiteIds } from "./lib/construction-site-changes.ts";
import {
  countUnseenConstructionSiteChanges,
  selectChangedNearbyConstructionSites,
  selectNearbyConstructionSites,
  type NearbyConstructionSite,
} from "./lib/nearby-construction-sites.ts";
import { AppSectionTabs } from "./components/AppSectionTabs.tsx";
import { ConstructionSiteDetail } from "./components/ConstructionSiteDetail.tsx";
import { ConstructionSiteExplorer } from "./components/ConstructionSiteExplorer.tsx";
import { ConstructionSiteSurroundings } from "./components/ConstructionSiteSurroundings.tsx";
import { ProgressiveWebAppSettings } from "./components/ProgressiveWebAppSettings.tsx";
import { useConstructionSiteData } from "./hooks/useConstructionSiteData.ts";
import { useCurrentLocation } from "./hooks/useCurrentLocation.ts";
import { useNotificationArea } from "./hooks/useNotificationArea.ts";
import { useProgressiveWebApp } from "./hooks/useProgressiveWebApp.ts";
import { usePushNotifications } from "./hooks/usePushNotifications.ts";
import { useSeenConstructionSiteChanges } from "./hooks/useSeenConstructionSiteChanges.ts";
import "./App.css";

/** Stable empty results while the data is loading or no area is defined. */
const NO_CONSTRUCTION_SITES: readonly ConstructionSite[] = [];
const NO_NEARBY_CONSTRUCTION_SITES: readonly NearbyConstructionSite[] = [];

/**
 * Page shell. Owns the shareable view state (section, filters, scope,
 * presentation, sort, detail) plus the personal state the surroundings view is
 * built on (area, notifications, acknowledgement), and picks the screen.
 */
export function App() {
  const constructionSiteData = useConstructionSiteData();
  const initialURLState = useMemo(
    () => parseAppURLState(window.location.search),
    [],
  );

  const [section, setSection] = useState<AppSection>(initialURLState.section);
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
  const [mapSelectedSiteId, setMapSelectedSiteId] = useState<string>();

  const locationController = useCurrentLocation();
  const progressiveWebApp = useProgressiveWebApp();
  const pushController = usePushNotifications();
  const {
    trackNotificationArea,
    syncNotificationArea,
    setFeedbackMessage,
    disableNotifications,
    isEnabled: areNotificationsEnabled,
  } = pushController;
  const { notificationArea, saveNotificationArea, clearNotificationArea } =
    useNotificationArea();
  const { seenAt, markChangesSeen } = useSeenConstructionSiteChanges();

  const urlState: AppURLState = useMemo(
    () => ({ section, filters, showOnlyChanged, view, sort, detailSiteId }),
    [detailSiteId, filters, section, showOnlyChanged, sort, view],
  );

  // Keep the address bar in step with the view so it can be shared or reloaded.
  // `replaceState` keeps typing out of the history stack; the delay keeps a
  // fast typist under the browsers' rate limit for history updates.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = serializeAppURLState(urlState);
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query}${window.location.hash}`,
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [urlState]);

  // Detail links use the History API so Back/Forward restores the complete
  // overview state without a full application reload.
  useEffect(() => {
    const restoreURLState = () => {
      const state = parseAppURLState(window.location.search);
      setSection(state.section);
      setFilters(state.filters);
      setShowOnlyChanged(state.showOnlyChanged);
      setView(state.view);
      setSort(state.sort);
      setDetailSiteId(state.detailSiteId);
    };
    window.addEventListener("popstate", restoreURLState);
    return () => window.removeEventListener("popstate", restoreURLState);
  }, []);

  // The push subscription stores the area, so the hook needs the current one
  // when the service worker becomes ready after a reload.
  useEffect(() => {
    trackNotificationArea(notificationArea);
  }, [notificationArea, trackNotificationArea]);

  const buildHref = useCallback(
    (overrides: Partial<AppURLState>) =>
      `${window.location.pathname}${serializeAppURLState({
        ...urlState,
        ...overrides,
      })}${window.location.hash}`,
    [urlState],
  );

  const getDetailHref = useCallback(
    (siteId: string | undefined) => buildHref({ detailSiteId: siteId }),
    [buildHref],
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

  /** Opens the explorer's map on one site, from anywhere in the app. */
  const showSiteOnMap = useCallback(
    (siteId: string | undefined) => {
      window.history.replaceState(
        null,
        "",
        buildHref({
          section: "explorer",
          view: "map",
          detailSiteId: undefined,
        }),
      );
      setSection("explorer");
      setView("map");
      setDetailSiteId(undefined);
      setMapSelectedSiteId(siteId);
    },
    [buildHref],
  );

  const showExplorer = useCallback(
    (nextView?: ConstructionSiteResultView) => {
      setSection("explorer");
      if (nextView) setView(nextView);
    },
    [],
  );

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
      const searchInput =
        document.querySelector<HTMLInputElement>("#filter-search");
      if (!searchInput) return;
      event.preventDefault();
      searchInput.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_APP_URL_STATE.filters);
    setShowOnlyChanged(false);
  }, []);

  /** Persists the area and keeps an existing push subscription in step. */
  const updateNotificationArea = useCallback(
    (area: NotificationArea) => {
      saveNotificationArea(area);
      trackNotificationArea(area);
      void syncNotificationArea(area).catch((error: unknown) => {
        setFeedbackMessage(
          error instanceof Error
            ? error.message
            : "Das Gebiet konnte nicht an den Benachrichtigungsdienst übertragen werden.",
        );
      });
    },
    [
      saveNotificationArea,
      setFeedbackMessage,
      syncNotificationArea,
      trackNotificationArea,
    ],
  );

  // Removing the area also ends the subscription: without an area the service
  // has nothing to match new construction sites against.
  const removeNotificationArea = useCallback(() => {
    clearNotificationArea();
    trackNotificationArea(null);
    if (areNotificationsEnabled) void disableNotifications();
  }, [
    areNotificationsEnabled,
    clearNotificationArea,
    disableNotifications,
    trackNotificationArea,
  ]);

  const currentLocation =
    locationController.locationState.status === "ready"
      ? locationController.locationState.point
      : undefined;

  const isReady = constructionSiteData.status === "ready";
  const constructionSites = isReady
    ? constructionSiteData.constructionSites
    : NO_CONSTRUCTION_SITES;
  const changes = isReady ? constructionSiteData.changes : undefined;

  const changedSiteIds = useMemo(
    () => (changes ? getChangedConstructionSiteIds(changes) : new Set<string>()),
    [changes],
  );
  // Computed once here: the tab badge and the surroundings screen must never
  // disagree about what is new around the visitor.
  const nearbyConstructionSites = useMemo(
    () =>
      changes && notificationArea
        ? selectNearbyConstructionSites(
            constructionSites,
            notificationArea,
            changes,
          )
        : NO_NEARBY_CONSTRUCTION_SITES,
    [changes, constructionSites, notificationArea],
  );
  const changedNearbyConstructionSites = useMemo(
    () => selectChangedNearbyConstructionSites(nearbyConstructionSites),
    [nearbyConstructionSites],
  );
  const unseenNearbyCount = countUnseenConstructionSiteChanges(
    changedNearbyConstructionSites,
    seenAt,
  );

  const detailSite = detailSiteId
    ? constructionSites.find((site) => site.id === detailSiteId)
    : undefined;

  return (
    <>
      <a className="skip-link" href="#main-content">
        Zum Inhalt
      </a>
      <KernKopfzeile label="Fächerbagger · Baustellen in Ihrer Umgebung" />
      <main id="main-content">
        <KernContainer>
          <header className="app-bar">
            <div className="app-bar__titles">
              <KernHeading level={1}>
                Baustellen in der Region Karlsruhe
              </KernHeading>
              <KernText className="app-bar__intro">
                Neue Baustellen im eigenen Umkreis erfahren — und bei Bedarf die
                ganze Region durchsuchen.
              </KernText>
            </div>
            {isReady && (
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

          {isReady && detailSiteId ? (
            detailSite ? (
              <ConstructionSiteDetail
                site={detailSite}
                overviewHref={getDetailHref(undefined)}
                onBack={closeSiteDetails}
                onShowOnMap={() => showSiteOnMap(detailSite.id)}
              />
            ) : (
              <KernAlert variant="warning" title="Baustelle nicht gefunden">
                <KernText>
                  Die verlinkte Baustelle ist im aktuellen Datenstand nicht
                  enthalten.
                </KernText>
                <a
                  href={getDetailHref(undefined)}
                  onClick={(event) => {
                    event.preventDefault();
                    closeSiteDetails();
                  }}
                >
                  Zur Übersicht
                </a>
              </KernAlert>
            )
          ) : (
            isReady && (
              <>
                <AppSectionTabs
                  section={section}
                  onSectionChange={setSection}
                  unseenCount={unseenNearbyCount}
                />

                {section === "surroundings" ? (
                  <ConstructionSiteSurroundings
                    constructionSites={constructionSites}
                    nearbyConstructionSites={nearbyConstructionSites}
                    changedNearbyConstructionSites={
                      changedNearbyConstructionSites
                    }
                    unseenCount={unseenNearbyCount}
                    changes={constructionSiteData.changes}
                    metadata={constructionSiteData.metadata}
                    notificationArea={notificationArea}
                    onNotificationAreaChange={updateNotificationArea}
                    onNotificationAreaClear={removeNotificationArea}
                    locationController={locationController}
                    pushController={pushController}
                    isInstalled={progressiveWebApp.isInstalled}
                    seenAt={seenAt}
                    onMarkChangesSeen={() =>
                      markChangesSeen(constructionSiteData.metadata.fetchedAt)
                    }
                    getSiteDetailsHref={getDetailHref}
                    onShowSiteDetails={openSiteDetails}
                    onShowSiteOnMap={showSiteOnMap}
                    onExploreAllConstructionSites={() => showExplorer()}
                  />
                ) : (
                  <ConstructionSiteExplorer
                    constructionSites={constructionSites}
                    changes={constructionSiteData.changes}
                    changedSiteIds={changedSiteIds}
                    filters={filters}
                    onFiltersChange={setFilters}
                    onFiltersReset={resetFilters}
                    showOnlyChanged={showOnlyChanged}
                    onShowOnlyChangedChange={setShowOnlyChanged}
                    view={view}
                    onViewChange={setView}
                    sort={sort}
                    onSortChange={setSort}
                    selectedSiteId={mapSelectedSiteId}
                    onSelectedSiteIdChange={setMapSelectedSiteId}
                    getDetailHref={getDetailHref}
                    onDetailOpen={openSiteDetails}
                    locationController={locationController}
                    currentLocation={currentLocation}
                    notificationArea={notificationArea ?? undefined}
                  />
                )}
              </>
            )
          )}

          {isReady && (
            <footer className="app-footer">
              <ProgressiveWebAppSettings progressiveWebApp={progressiveWebApp} />
              <details className="kern-accordion app-footer__details">
                <summary className="kern-accordion__header">
                  <span className="kern-title">Datenquelle und Hinweise</span>
                </summary>
                <section className="kern-accordion__body">
                  <KernText>
                    Daten: {constructionSiteData.metadata.source.name}. Quellen:{" "}
                    {constructionSiteData.metadata.attribution.join(", ")}.
                    Letzte Aktualisierung:{" "}
                    {new Date(
                      constructionSiteData.metadata.fetchedAt,
                    ).toLocaleString("de-DE")}
                    .
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
          )}
        </KernContainer>
      </main>
    </>
  );
}
