import { useEffect, useState } from "react";
import {
  KernAlert,
  KernContainer,
  KernHeading,
  KernKopfzeile,
  KernLink,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type { NotificationArea } from "./types/index.ts";
import {
  EMPTY_CONSTRUCTION_SITE_FILTERS,
  type ConstructionSiteFilters,
} from "./lib/construction-site-filter.ts";
import { ConstructionSiteFilter } from "./components/ConstructionSiteFilter.tsx";
import { ConstructionSiteResults } from "./components/ConstructionSiteResults.tsx";
import { CurrentLocationControl } from "./components/CurrentLocationControl.tsx";
import { PwaSettings } from "./components/PwaSettings.tsx";
import { useCurrentLocation } from "./hooks/useCurrentLocation.ts";
import { useConstructionSiteData } from "./hooks/useConstructionSiteData.ts";
import {
  loadNotificationArea,
  saveNotificationArea,
} from "./lib/notification-area.ts";
import "./App.css";

/**
 * Renders the construction sites as a filterable map and sortable list.
 */
export function App() {
  const dataState = useConstructionSiteData();
  const [filters, setFilters] = useState<ConstructionSiteFilters>(
    EMPTY_CONSTRUCTION_SITE_FILTERS,
  );
  const [notificationArea, setNotificationArea] =
    useState<NotificationArea | null>(loadNotificationArea);
  const locationController = useCurrentLocation();

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

  return (
    <>
      <a className="skip-link" href="#main-content">
        Zum Inhalt
      </a>
      <KernKopfzeile label="Fächerbagger · Baustellenportal" />
      <main id="main-content">
        <KernContainer>
          <header className="app-hero">
            <div className="app-hero__text">
              <KernText className="app-hero__eyebrow">Region Karlsruhe</KernText>
              <KernHeading level={1}>Baustellen im Blick</KernHeading>
              <KernText className="app-hero__intro">
                Aktuelle und geplante Straßenbaustellen finden, vergleichen und
                im Blick behalten.
              </KernText>
            </div>
            {dataState.status === "ready" && (
              <KernText muted className="app-hero__updated">
                Stand{" "}
                {new Date(dataState.metadata.fetchedAt).toLocaleString("de-DE")}
              </KernText>
            )}
          </header>

          {dataState.status === "loading" && (
            <div className="app-status" role="status" aria-live="polite">
              <span className="app-status__spinner" aria-hidden="true" />
              <KernText>Daten werden geladen …</KernText>
            </div>
          )}

          {dataState.status === "error" && (
            <KernAlert variant="warning" title="Daten noch nicht verfügbar">
              <KernText>
                Die Baustellendaten konnten nicht geladen werden. Versuchen Sie
                es später erneut. ({dataState.message})
              </KernText>
            </KernAlert>
          )}

          {dataState.status === "ready" && (
            <>
              <div className="app-shell">
                <section
                  className="overview"
                  role="group"
                  aria-label="Baustellen nach Status filtern"
                >
                  {(
                    [
                      {
                        value: "",
                        label: "Alle",
                        count: dataState.metadata.recordCount,
                        kind: "total",
                      },
                      {
                        value: "active",
                        label: "Aktuell",
                        count: dataState.metadata.counts.active,
                        kind: "active",
                      },
                      {
                        value: "upcoming",
                        label: "Geplant",
                        count: dataState.metadata.counts.upcoming,
                        kind: "upcoming",
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className={`overview__item overview__item--${item.kind}`}
                      aria-pressed={filters.phase === item.value}
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          phase: item.value,
                        }))
                      }
                    >
                      <span className="overview__value">{item.count}</span>
                      <span className="overview__label">{item.label}</span>
                    </button>
                  ))}
                </section>

                <ConstructionSiteFilter
                  constructionSites={dataState.constructionSites}
                  filters={filters}
                  onFiltersChange={setFilters}
                  onFiltersReset={() =>
                    setFilters(EMPTY_CONSTRUCTION_SITE_FILTERS)
                  }
                />

                <ConstructionSiteResults
                  constructionSites={dataState.constructionSites}
                  changes={dataState.changes}
                  filters={filters}
                  currentLocation={
                    locationController.locationState.status === "ready"
                      ? locationController.locationState.point
                      : undefined
                  }
                  notificationArea={notificationArea ?? undefined}
                />

                <aside
                  className="personal-tools"
                  aria-label="Persönliche Werkzeuge"
                >
                  <CurrentLocationControl
                    locationController={locationController}
                  />
                  <PwaSettings
                    locationController={locationController}
                    notificationArea={notificationArea}
                    onNotificationAreaChange={(area) => {
                      saveNotificationArea(area);
                      setNotificationArea(area);
                    }}
                  />
                </aside>
              </div>

              <footer className="app-footer">
                <details className="kern-accordion app-footer__details">
                  <summary className="kern-accordion__header">
                    <span className="kern-title">Datenquelle und Hinweise</span>
                  </summary>
                  <section className="kern-accordion__body">
                    <KernText>
                      Daten: {dataState.metadata.source.name}. Quellen:{" "}
                      {dataState.metadata.attribution.join(", ")}. Letzte
                      Aktualisierung:{" "}
                      {new Date(dataState.metadata.fetchedAt).toLocaleString(
                        "de-DE",
                      )}
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
            </>
          )}
        </KernContainer>
      </main>
    </>
  );
}
