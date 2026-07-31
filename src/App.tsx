import { useMemo } from "react";
import {
  KernAlert,
  KernContainer,
  KernHeading,
  KernKopfzeile,
  KernLink,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import { selectConstructionSites } from "./lib/select-construction-sites.ts";
import { createHomeAreaScope } from "./lib/construction-site-scope.ts";
import { AppSectionTabs } from "./components/AppSectionTabs.tsx";
import { ClientNavigationLink } from "./components/ClientNavigationLink.tsx";
import { ConstructionSiteDetail } from "./components/ConstructionSiteDetail.tsx";
import { ConstructionSiteExplorer } from "./components/ConstructionSiteExplorer.tsx";
import { ConstructionSiteSurroundings } from "./components/ConstructionSiteSurroundings.tsx";
import { LoadingStatus } from "./components/LoadingStatus.tsx";
import { NotificationSettings } from "./components/NotificationSettings.tsx";
import { ProgressiveWebAppSettings } from "./components/ProgressiveWebAppSettings.tsx";
import {
  DatasetProvider,
  useDataset,
  useDatasetState,
} from "./context/DatasetContext.tsx";
import { PersonalProvider, usePersonal } from "./context/PersonalContext.tsx";
import { ViewProvider, useView } from "./context/ViewContext.tsx";
import "./App.css";

const formatDataTimestamp = (timestamp: string): string =>
  new Date(timestamp).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });

/**
 * One construction site, or an explanation why the link no longer resolves —
 * a shared link outlives the record it points at, because the dataset only
 * carries what the source currently publishes.
 */
function ConstructionSiteDetailScreen({
  constructionSiteId,
}: {
  constructionSiteId: string;
}) {
  const { constructionSites } = useDataset();
  const {
    getConstructionSiteDetailHref,
    closeConstructionSiteDetail,
    showConstructionSiteOnMap,
    recentWindow,
  } = useView();
  const constructionSite = constructionSites.find(
    (candidate) => candidate.id === constructionSiteId,
  );

  if (!constructionSite) {
    return (
      <KernAlert variant="warning" title="Baustelle nicht gefunden">
        <KernText>
          Die verlinkte Baustelle ist im aktuellen Datenstand nicht enthalten.
        </KernText>
        <ClientNavigationLink
          href={getConstructionSiteDetailHref(undefined)}
          onNavigate={closeConstructionSiteDetail}
        >
          Zur Übersicht
        </ClientNavigationLink>
      </KernAlert>
    );
  }

  return (
    <ConstructionSiteDetail
      constructionSite={constructionSite}
      today={recentWindow.today}
      overviewHref={getConstructionSiteDetailHref(undefined)}
      onBack={closeConstructionSiteDetail}
      onShowConstructionSiteOnMap={() =>
        showConstructionSiteOnMap(constructionSite.id)
      }
    />
  );
}

/**
 * Picks the screen once the data is there.
 *
 * Split out from the shell so it can use {@link useDataset}: everything below
 * this point only ever renders with a loaded dataset, and says so in its types
 * instead of threading a nullable one through.
 */
function AppScreens() {
  const { constructionSites, metadata } = useDataset();
  const { effectiveArea, seenAt, markConstructionSitesSeen } = usePersonal();
  const urlState = useView();
  const { recentWindow } = urlState;

  // Derived once here: the tab badge and the surroundings screen must never
  // disagree about what is new around the visitor. Selected over the *effective*
  // area, so a first visit lands on a populated screen instead of a form —
  // the guess is labelled on the screen it fills, not hidden.
  const surroundings = useMemo(
    () =>
      selectConstructionSites(
        constructionSites,
        createHomeAreaScope(effectiveArea, recentWindow),
        seenAt,
      ),
    [constructionSites, effectiveArea, recentWindow, seenAt],
  );

  // The tabs stay above a detail page too: on a phone they are the bottom bar,
  // and losing the way to the notifications while reading about one
  // construction site would be a dead end. A detail overrides the section
  // rather than replacing it, so closing it returns to where the visitor was.
  return (
    <>
      <AppSectionTabs
        section={urlState.section}
        onSectionChange={urlState.setSection}
        unseenCount={surroundings.unseenCount}
      />

      {urlState.detailConstructionSiteId ? (
        <ConstructionSiteDetailScreen
          constructionSiteId={urlState.detailConstructionSiteId}
        />
      ) : (
        <>
          {urlState.section === "surroundings" && (
            <ConstructionSiteSurroundings
              surroundings={surroundings}
              onMarkConstructionSitesSeen={() =>
                markConstructionSitesSeen(metadata.fetchedAt)
              }
            />
          )}
          {urlState.section === "explorer" && <ConstructionSiteExplorer />}
          {urlState.section === "notifications" && <NotificationSettings />}
        </>
      )}
    </>
  );
}

/**
 * Attribution, shown once the source metadata is known.
 *
 * Deliberately not the freshness timestamp — the page bar carries that above
 * the fold — and not the feeds, which belong with the notification section they
 * are the alternative to.
 */
function AppFooter() {
  const { metadata } = useDataset();
  const { progressiveWebApp } = usePersonal();

  return (
    <footer className="app-footer">
      <ProgressiveWebAppSettings progressiveWebApp={progressiveWebApp} />
      <details className="kern-accordion app-footer__details">
        <summary className="kern-accordion__header">
          <span className="kern-title">Datenquelle und Hinweise</span>
        </summary>
        <section className="kern-accordion__body">
          <KernText>
            Daten: {metadata.source.name}. Quellen:{" "}
            {metadata.attribution.join(", ")}.
          </KernText>
          <KernLink
            href="https://mobil.trk.de/"
            label="Zum Mobilitätsportal der TRK"
          />
        </section>
      </details>
    </footer>
  );
}

/** The page: header, the load states, and the screens once there is data. */
function AppShell() {
  const dataState = useDatasetState();
  const isReady = dataState.status === "ready";

  return (
    <>
      <a className="skip-link" href="#main-content">
        Zum Inhalt
      </a>
      {/* The brand only: the page bar below states what the app shows, and the
          two lines said nearly the same thing on top of each other. */}
      <KernKopfzeile label="Fächerbagger" />
      <main id="main-content">
        <KernContainer>
          <header className="app-bar">
            {/* The title alone: each section states its own purpose below,
                and a standing slogan only pushed the answer off the phone. */}
            <div className="app-bar__titles">
              <KernHeading level={1}>
                Baustellen in der Region Karlsruhe
              </KernHeading>
            </div>
            {isReady && (
              <p className="app-bar__updated">
                <span className="app-bar__dot" aria-hidden="true" />
                Stand {formatDataTimestamp(dataState.metadata.fetchedAt)}
              </p>
            )}
          </header>

          {dataState.status === "loading" && (
            <LoadingStatus message="Daten werden geladen …" />
          )}

          {dataState.status === "error" && (
            <KernAlert variant="warning" title="Daten noch nicht verfügbar">
              <KernText>
                Die Baustellendaten konnten nicht geladen werden. Versuchen Sie
                es später erneut. ({dataState.message})
              </KernText>
            </KernAlert>
          )}

          {isReady && (
            <>
              <AppScreens />
              <AppFooter />
            </>
          )}
        </KernContainer>
      </main>
    </>
  );
}

export function App() {
  return (
    <DatasetProvider>
      <PersonalProvider>
        <ViewProvider>
          <AppShell />
        </ViewProvider>
      </PersonalProvider>
    </DatasetProvider>
  );
}
