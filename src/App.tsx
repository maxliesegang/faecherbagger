import { useCallback, useEffect, useMemo } from "react";
import {
  KernAlert,
  KernContainer,
  KernHeading,
  KernKopfzeile,
  KernLink,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type { ConstructionSite, NotificationArea } from "./types/index.ts";
import { getChangedConstructionSiteIds } from "./lib/construction-site-changes.ts";
import {
  countUnseenConstructionSiteChanges,
  selectChangedNearbyConstructionSites,
  selectNearbyConstructionSites,
  type NearbyConstructionSite,
} from "./lib/nearby-construction-sites.ts";
import { AppSectionTabs } from "./components/AppSectionTabs.tsx";
import { ClientNavigationLink } from "./components/ClientNavigationLink.tsx";
import { ConstructionSiteDetail } from "./components/ConstructionSiteDetail.tsx";
import { ConstructionSiteExplorer } from "./components/ConstructionSiteExplorer.tsx";
import { ConstructionSiteSurroundings } from "./components/ConstructionSiteSurroundings.tsx";
import { LoadingStatus } from "./components/LoadingStatus.tsx";
import { ProgressiveWebAppSettings } from "./components/ProgressiveWebAppSettings.tsx";
import { useAppURLState } from "./hooks/useAppURLState.ts";
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

const formatDataTimestamp = (timestamp: string): string =>
  new Date(timestamp).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });

/**
 * Page shell. Owns the personal state the surroundings view is built on (area,
 * notifications, acknowledgement), derives what is new around the visitor once
 * for every screen, and picks the screen. The shareable view state lives in
 * {@link useAppURLState}.
 */
export function App() {
  const constructionSiteData = useConstructionSiteData();
  const urlState = useAppURLState();
  const { getDetailHref, openSiteDetails, closeSiteDetails, showSiteOnMap } =
    urlState;

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

  // The push subscription stores the area, so the hook needs the current one
  // when the service worker becomes ready after a reload.
  useEffect(() => {
    trackNotificationArea(notificationArea);
  }, [notificationArea, trackNotificationArea]);

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

  const detailSite = urlState.detailSiteId
    ? constructionSites.find((site) => site.id === urlState.detailSiteId)
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
                Stand {formatDataTimestamp(constructionSiteData.metadata.fetchedAt)}
              </p>
            )}
          </header>

          {constructionSiteData.status === "loading" && (
            <LoadingStatus message="Daten werden geladen …" />
          )}

          {constructionSiteData.status === "error" && (
            <KernAlert variant="warning" title="Daten noch nicht verfügbar">
              <KernText>
                Die Baustellendaten konnten nicht geladen werden. Versuchen Sie
                es später erneut. ({constructionSiteData.message})
              </KernText>
            </KernAlert>
          )}

          {isReady && urlState.detailSiteId ? (
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
                <ClientNavigationLink
                  href={getDetailHref(undefined)}
                  onNavigate={closeSiteDetails}
                >
                  Zur Übersicht
                </ClientNavigationLink>
              </KernAlert>
            )
          ) : (
            isReady && (
              <>
                <AppSectionTabs
                  section={urlState.section}
                  onSectionChange={urlState.setSection}
                  unseenCount={unseenNearbyCount}
                />

                {urlState.section === "surroundings" ? (
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
                    onExploreAllConstructionSites={urlState.showExplorer}
                  />
                ) : (
                  <ConstructionSiteExplorer
                    constructionSites={constructionSites}
                    changes={constructionSiteData.changes}
                    changedSiteIds={changedSiteIds}
                    filters={urlState.filters}
                    onFiltersChange={urlState.setFilters}
                    onFiltersReset={urlState.resetFilters}
                    showOnlyChanged={urlState.showOnlyChanged}
                    onShowOnlyChangedChange={urlState.setShowOnlyChanged}
                    view={urlState.view}
                    onViewChange={urlState.setView}
                    sort={urlState.sort}
                    onSortChange={urlState.setSort}
                    selectedSiteId={urlState.mapSelectedSiteId}
                    onSelectedSiteIdChange={urlState.setMapSelectedSiteId}
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
