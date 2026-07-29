import { useMemo } from "react";
import {
  KernAlert,
  KernContainer,
  KernHeading,
  KernKopfzeile,
  KernLink,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import { EMPTY_SITE_SELECTION, selectSites } from "./lib/select-sites.ts";
import { createAreaScope } from "./lib/site-scope.ts";
import { AppSectionTabs } from "./components/AppSectionTabs.tsx";
import { ClientNavigationLink } from "./components/ClientNavigationLink.tsx";
import { ConstructionSiteDetail } from "./components/ConstructionSiteDetail.tsx";
import { ConstructionSiteExplorer } from "./components/ConstructionSiteExplorer.tsx";
import { ConstructionSiteSurroundings } from "./components/ConstructionSiteSurroundings.tsx";
import { LoadingStatus } from "./components/LoadingStatus.tsx";
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
 * Picks the screen once the data is there.
 *
 * Split out from the shell so it can use {@link useDataset}: everything below
 * this point only ever renders with a loaded dataset, and says so in its types
 * instead of threading a nullable one through.
 */
function AppScreens() {
  const { constructionSites, metadata } = useDataset();
  const { area, seenAt, markSitesSeen } = usePersonal();
  const urlState = useView();
  const { recentWindow } = urlState;

  // Derived once here: the tab badge and the surroundings screen must never
  // disagree about what is new around the visitor. Without an area there is no
  // surroundings to speak of, so the selection stays empty rather than
  // widening to the whole region.
  const surroundings = useMemo(
    () =>
      area
        ? selectSites(
            constructionSites,
            createAreaScope(area, recentWindow),
            seenAt,
          )
        : EMPTY_SITE_SELECTION,
    [area, constructionSites, recentWindow, seenAt],
  );

  const detailSite = urlState.detailSiteId
    ? constructionSites.find((site) => site.id === urlState.detailSiteId)
    : undefined;

  if (urlState.detailSiteId) {
    return detailSite ? (
      <ConstructionSiteDetail
        site={detailSite}
        overviewHref={urlState.getDetailHref(undefined)}
        onBack={urlState.closeSiteDetails}
        onShowOnMap={() => urlState.showSiteOnMap(detailSite.id)}
      />
    ) : (
      <KernAlert variant="warning" title="Baustelle nicht gefunden">
        <KernText>
          Die verlinkte Baustelle ist im aktuellen Datenstand nicht enthalten.
        </KernText>
        <ClientNavigationLink
          href={urlState.getDetailHref(undefined)}
          onNavigate={urlState.closeSiteDetails}
        >
          Zur Übersicht
        </ClientNavigationLink>
      </KernAlert>
    );
  }

  return (
    <>
      <AppSectionTabs
        section={urlState.section}
        onSectionChange={urlState.setSection}
        unseenCount={surroundings.unseenCount}
      />

      {urlState.section === "surroundings" ? (
        <ConstructionSiteSurroundings
          surroundings={surroundings}
          onMarkSitesSeen={() => markSitesSeen(metadata.fetchedAt)}
        />
      ) : (
        <ConstructionSiteExplorer />
      )}
    </>
  );
}

/** Attribution and the feeds, shown once the source metadata is known. */
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
