import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  KernAlert,
  KernContainer,
  KernLoader,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type {
  LngLat,
  NotificationArea,
  NotificationPreferences,
} from "./types/index.ts";
import {
  countConstructionSitesByPhase,
  type ConstructionSiteFilters,
} from "./lib/construction-site-filter.ts";
import type { ConstructionSiteSort } from "./lib/construction-site-sort.ts";
import {
  DEFAULT_APP_URL_STATE,
  parseAppURLState,
  serializeAppURLState,
  type AppSection,
  type AppURLState,
  type ConstructionSiteResultView,
} from "./lib/url-state.ts";
import { LEGAL_PAGES, type LegalPageId } from "./lib/legal-pages.ts";
import { formatISOTimestamp } from "./lib/construction-site-labels.ts";
import { ConstructionSiteFilter } from "./components/ConstructionSiteFilter.tsx";
import { LegalPage } from "./components/LegalPage.tsx";
import { ConstructionSiteDetail } from "./components/ConstructionSiteDetail.tsx";
import {
  ConstructionSiteResults,
  ResultViewSwitcher,
} from "./components/ConstructionSiteResults.tsx";
import { AppNavigation } from "./components/AppNavigation.tsx";
import { RelevantConstructionSites } from "./components/RelevantConstructionSites.tsx";
import { SettingsPage } from "./components/SettingsPage.tsx";
import { NotificationSetupDialog } from "./components/NotificationSetupDialog.tsx";
import { selectRelevantConstructionSites } from "./lib/relevant-construction-sites.ts";
import { CurrentLocationControl } from "./components/CurrentLocationControl.tsx";
import {
  useCurrentLocation,
  type CurrentLocationController,
} from "./hooks/useCurrentLocation.ts";
import {
  useConstructionSiteData,
  type ConstructionSiteDataState,
} from "./hooks/useConstructionSiteData.ts";
import { getChangedConstructionSiteIds } from "./lib/construction-site-changes.ts";
import { useBerlinCalendarDate } from "./hooks/useBerlinCalendarDate.ts";
import { useNotificationInbox } from "./hooks/useNotificationInbox.ts";
import { useNotificationPreferences } from "./hooks/useNotificationPreferences.ts";
import {
  usePushNotifications,
  type PushNotificationsController,
} from "./hooks/usePushNotifications.ts";
import "./App.css";

const SECTION_TITLES: Record<AppSection, string> = {
  relevant: "Für mich",
  explore: "Alle Baustellen",
  settings: "Einstellungen",
};

/**
 * Page shell: owns the shareable view state (section, filters, presentation,
 * sort, detail), the app header and the navigation.
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
  const [legalPageId, setLegalPageId] = useState<LegalPageId | undefined>(
    initialURLState.legalPageId,
  );
  const notificationPreferencesController = useNotificationPreferences();
  const locationController = useCurrentLocation();
  const pushNotifications = usePushNotifications();
  const notificationInbox = useNotificationInbox();

  // Keep the address bar in step with the view so it can be shared or reloaded.
  // `replaceState` keeps typing out of the history stack; the delay keeps a
  // fast typist under the browsers' rate limit for history updates.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = serializeAppURLState({
        section,
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
  }, [detailSiteId, filters, legalPageId, section, showOnlyChanged, sort, view]);

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
        section,
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
    [detailSiteId, filters, legalPageId, section, showOnlyChanged, sort, view],
  );

  const changeSection = useCallback((target: AppSection) => {
    setSection(target);
    setDetailSiteId(undefined);
    setLegalPageId(undefined);
  }, []);

  const getSectionHref = useCallback(
    (target: AppSection) =>
      getAppHref({
        section: target,
        detailSiteId: undefined,
        legalPageId: undefined,
      }),
    [getAppHref],
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
      getAppHref({ section: "explore", view: "map", detailSiteId: undefined }),
    );
    setSection("explore");
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

  const dataFreshness =
    constructionSiteData.status === "ready" ? (
      <DataFreshness fetchedAt={constructionSiteData.metadata.fetchedAt} />
    ) : null;

  return (
    <>
      <a className="skip-link" href="#main-content">
        Zum Inhalt
      </a>
      <header className="app-header">
        <div className="app-header__inner">
          <a
            className="app-header__brand"
            href={getSectionHref("relevant")}
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
              changeSection("relevant");
            }}
          >
            <span className="app-header__name">Fächerbagger</span>
            <span className="app-header__tagline">Baustellen Karlsruhe</span>
          </a>
          <AppNavigation
            section={section}
            onSectionChange={changeSection}
            getSectionHref={getSectionHref}
            unreadCount={notificationInbox.unreadCount}
          />
        </div>
      </header>
      <main id="main-content">
        <KernContainer>
          {legalPageId ? (
            <LegalPage
              pageId={legalPageId}
              overviewHref={getAppHref({ legalPageId: undefined })}
              onBack={closeLegalPage}
            />
          ) : (
            <ConstructionSitePortal
              constructionSiteData={constructionSiteData}
              dataFreshness={dataFreshness}
              section={section}
              onSectionChange={changeSection}
              getSectionHref={getSectionHref}
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
              isNotificationPreferencesLoaded={
                notificationPreferencesController.isLoaded
              }
              onNotificationPreferencesChange={
                notificationPreferencesController.setPreferences
              }
              onToggleFollowed={notificationPreferencesController.toggleFollowed}
              onPruneFollowed={notificationPreferencesController.pruneFollowed}
              pushNotifications={pushNotifications}
              notificationInbox={notificationInbox}
            />
          )}
          <AppFooter
            getLegalPageHref={(pageId) => getAppHref({ legalPageId: pageId })}
            onLegalPageOpen={openLegalPage}
          />
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
  dataFreshness: ReactNode;
}

/**
 * The portal itself: page title, load state, and the screens once data is
 * there. Split from {@link App} so the legal pages can take over the container
 * without carrying any of this along.
 */
function ConstructionSitePortal({
  constructionSiteData,
  dataFreshness,
  ...explorerProps
}: ConstructionSitePortalProps) {
  const isDetailView = Boolean(explorerProps.detailSiteId);

  return (
    <>
      {/*
        On the detail view the site itself owns the h1, so the section title
        steps aside rather than competing with it in the outline.
      */}
      {!isDetailView && (
        <div className="app-title">
          <div className="app-title__text">
            <h1>{SECTION_TITLES[explorerProps.section]}</h1>
            {/* Settings states the data age in its own words. */}
            {explorerProps.section !== "settings" && dataFreshness}
          </div>
          {explorerProps.section === "explore" && (
            <ResultViewSwitcher
              view={explorerProps.view}
              onViewChange={explorerProps.onViewChange}
            />
          )}
        </div>
      )}

      {constructionSiteData.status === "loading" && (
        <div className="app-status" role="status">
          <KernLoader />
          <KernText>Daten werden geladen …</KernText>
        </div>
      )}

      {constructionSiteData.status === "error" && (
        <KernAlert variant="warning" title="Daten nicht geladen">
          <KernText>
            Bitte versuchen Sie es später erneut. ({constructionSiteData.message})
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
      className="app-freshness"
      data-state={isStale ? "stale" : "fresh"}
      title={
        isStale
          ? "Seit über einem Tag nicht aktualisiert."
          : undefined
      }
    >
      <span className="app-freshness__dot" aria-hidden="true" />
      Stand {formatISOTimestamp(fetchedAt)}
      {isStale && " · veraltet"}
    </p>
  );
}

type LoadedConstructionSiteData = Extract<
  ReturnType<typeof useConstructionSiteData>,
  { status: "ready" }
>;

type NotificationInbox = ReturnType<typeof useNotificationInbox>;

interface ConstructionSiteExplorerProps
  extends Pick<
    LoadedConstructionSiteData,
    "constructionSites" | "changes" | "metadata"
  > {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  getSectionHref: (section: AppSection) => string;
  onToggleFollowed: (siteId: string) => boolean;
  onPruneFollowed: (knownSiteIds: ReadonlySet<string>) => void;
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
  isNotificationPreferencesLoaded: boolean;
  onNotificationPreferencesChange: (
    preferences: NotificationPreferences,
  ) => void;
  pushNotifications: PushNotificationsController;
  notificationInbox: NotificationInbox;
}

/** The place being edited in the setup dialog; `undefined` area means a new one. */
interface AreaSetupState {
  editedArea?: NotificationArea;
}

/**
 * The loaded screens. Split out so the derived lists are only computed once
 * data is available.
 */
function ConstructionSiteExplorer({
  constructionSites,
  changes,
  metadata,
  section,
  onSectionChange,
  getSectionHref,
  onToggleFollowed,
  onPruneFollowed,
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
  isNotificationPreferencesLoaded,
  onNotificationPreferencesChange,
  pushNotifications,
  notificationInbox,
}: ConstructionSiteExplorerProps) {
  const [mapSelectedSiteId, setMapSelectedSiteId] = useState<
    string | undefined
  >();
  const [areaSetup, setAreaSetup] = useState<AreaSetupState>();
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
  const today = useBerlinCalendarDate();
  const followedSiteIds = useMemo(
    () => new Set(notificationPreferences.followedSiteIds),
    [notificationPreferences.followedSiteIds],
  );
  const staleFollowedCount = useMemo(() => {
    const knownSiteIds = new Set(constructionSites.map((site) => site.id));
    return notificationPreferences.followedSiteIds.filter(
      (siteId) => !knownSiteIds.has(siteId),
    ).length;
  }, [constructionSites, notificationPreferences.followedSiteIds]);
  const relevantConstructionSites = useMemo(
    () =>
      selectRelevantConstructionSites(
        constructionSites,
        notificationPreferences.areas,
        { today, followedSiteIds, changedSiteIds },
      ),
    [
      changedSiteIds,
      constructionSites,
      followedSiteIds,
      notificationPreferences.areas,
      today,
    ],
  );
  const phaseCounts = useMemo(
    () => countConstructionSitesByPhase(scopedConstructionSites, filters, today),
    [filters, scopedConstructionSites, today],
  );
  const detailSite = detailSiteId
    ? constructionSites.find((site) => site.id === detailSiteId)
    : undefined;

  const setupDialog = areaSetup && (
    <NotificationSetupDialog
      preferences={notificationPreferences}
      constructionSites={constructionSites}
      editedArea={areaSetup.editedArea}
      locationController={locationController}
      pushNotifications={pushNotifications}
      onPreferencesChange={onNotificationPreferencesChange}
      onClose={() => setAreaSetup(undefined)}
      onComplete={() => {
        setAreaSetup(undefined);
        onSectionChange("relevant");
      }}
    />
  );

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
        isFollowed={followedSiteIds.has(detailSite.id)}
        onToggleFollowed={onToggleFollowed}
        onNotificationSettingsOpen={() => onSectionChange("settings")}
      />
    ) : (
      <KernAlert variant="warning" title="Baustelle nicht gefunden">
        <KernText>
          Die Baustelle ist nicht mehr in den aktuellen Daten.
        </KernText>
        <a
          href={getDetailHref(undefined)}
          onClick={(event) => {
            event.preventDefault();
            onDetailClose();
          }}
        >
          Zur Übersicht
        </a>
      </KernAlert>
    );
  }

  if (section === "relevant") {
    return (
      <>
        <RelevantConstructionSites
          selection={relevantConstructionSites}
          areas={notificationPreferences.areas}
          isPreferencesLoaded={isNotificationPreferencesLoaded}
          notificationEvents={notificationInbox.events}
          unreadSignatures={notificationInbox.unreadSignatures}
          onMarkRead={notificationInbox.markRead}
          hasInboxError={notificationInbox.hasError}
          pushNotifications={pushNotifications}
          getDetailHref={getDetailHref}
          onDetailOpen={onDetailOpen}
          onAreaSetupOpen={() => setAreaSetup({})}
          getSettingsHref={() => getSectionHref("settings")}
          onSettingsOpen={() => onSectionChange("settings")}
          getExploreHref={() => getSectionHref("explore")}
          onExploreOpen={() => onSectionChange("explore")}
          staleFollowedCount={staleFollowedCount}
          onPruneFollowed={() =>
            onPruneFollowed(new Set(constructionSites.map((site) => site.id)))
          }
        />
        {setupDialog}
      </>
    );
  }

  if (section === "settings") {
    return (
      <>
        <SettingsPage
          preferences={notificationPreferences}
          onPreferencesChange={onNotificationPreferencesChange}
          onAreaEdit={(area) => setAreaSetup({ editedArea: area })}
          pushNotifications={pushNotifications}
          metadata={metadata}
        />
        {setupDialog}
      </>
    );
  }

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
          locationControl={
            <CurrentLocationControl
              locationController={locationController}
              onUseCurrentLocation={onUseCurrentLocation}
            />
          }
        />
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
  );
}

interface AppFooterProps {
  getLegalPageHref: (pageId: LegalPageId) => string;
  onLegalPageOpen: (pageId: LegalPageId) => void;
}

/**
 * Disclaimer and legal links on every screen. A site that tells people which
 * roads are closed has to say that it is not binding wherever they read it;
 * sources and feeds live on the settings screen.
 */
function AppFooter({ getLegalPageHref, onLegalPageOpen }: AppFooterProps) {
  return (
    <footer className="app-footer">
      {/*
        KERN is the state's design system, so an app built with it reads as an
        official service. It is not one, and that has to be visible on every
        screen without opening the Impressum.
      */}
      <p>
        Privates Angebot, keine amtliche Auskunft. Angaben ohne Gewähr, es gilt
        die Beschilderung vor Ort.
      </p>
      <ul className="app-footer__links">
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
  );
}
