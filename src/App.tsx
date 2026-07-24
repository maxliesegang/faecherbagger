import { useEffect, useMemo, useState } from "react";
import {
  KernAlert,
  KernContainer,
  KernHeading,
  KernKopfzeile,
  KernLink,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type { Baustelle, Meta } from "./types/index.ts";
import { loadBaustellen, loadMeta } from "./lib/data.ts";
import { applyFilters, EMPTY_FILTERS, type Filters } from "./lib/filter.ts";
import { BaustellenFilter } from "./components/BaustellenFilter.tsx";
import { BaustellenTable } from "./components/BaustellenTable.tsx";
import { BaustellenMap } from "./components/BaustellenMap.tsx";
import { LocationControl } from "./components/LocationControl.tsx";
import { PwaControls } from "./components/PwaControls.tsx";
import { useCurrentLocation } from "./hooks/useCurrentLocation.ts";
import { isEmptyFilters } from "./lib/filter.ts";
import "./App.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; meta: Meta; baustellen: Baustelle[] }
  | { status: "error"; message: string };

/**
 * Loads the static JSON (`meta.json` + `baustellen.json`) on mount and renders
 * the construction sites as a sortable summary plus a table.
 */
export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [view, setView] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<string>();
  const location = useCurrentLocation();

  const records = state.status === "ready" ? state.baustellen : undefined;
  const filtered = useMemo(
    () => (records ? applyFilters(records, filters) : []),
    [records, filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () =>
      Promise.all([
        loadMeta(controller.signal),
        loadBaustellen(controller.signal),
      ])
      .then(([meta, baustellen]) => setState({ status: "ready", meta, baustellen }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unbekannter Fehler",
        });
      });
    void refresh();

    const onWorkerMessage = (event: MessageEvent) => {
      if (
        event.data?.type === "DATA_UPDATED" ||
        event.data?.type === "REFRESH_VIEW"
      ) {
        void refresh();
      }
    };
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    return () => {
      controller.abort();
      navigator.serviceWorker?.removeEventListener(
        "message",
        onWorkerMessage,
      );
    };
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
            <div>
              <KernText className="app-hero__eyebrow">Region Karlsruhe</KernText>
              <KernHeading level={1}>Baustellen im Blick</KernHeading>
              <KernText className="app-hero__intro">
                Aktuelle und geplante Straßenbaustellen schnell finden.
              </KernText>
            </div>
            {state.status === "ready" && (
              <KernText muted className="app-hero__updated">
                Stand {new Date(state.meta.fetchedAt).toLocaleString("de-DE")}
              </KernText>
            )}
          </header>

          {state.status === "loading" && (
            <div className="app-status" role="status" aria-live="polite">
              <span className="app-status__spinner" aria-hidden="true" />
              <KernText>Daten werden geladen …</KernText>
            </div>
          )}

          {state.status === "error" && (
            <KernAlert variant="warning" title="Daten noch nicht verfügbar">
              <KernText>
                Die Baustellendaten konnten nicht geladen werden. Versuchen Sie
                es später erneut. ({state.message})
              </KernText>
            </KernAlert>
          )}

          {state.status === "ready" && (
            <>
              <section className="overview" aria-label="Übersicht">
                <div className="overview__item overview__item--active">
                  <span className="overview__value">{state.meta.counts.active}</span>
                  <span className="overview__label">Aktuell</span>
                </div>
                <div className="overview__item overview__item--upcoming">
                  <span className="overview__value">
                    {state.meta.counts.upcoming}
                  </span>
                  <span className="overview__label">Geplant</span>
                </div>
                <div className="overview__item">
                  <span className="overview__value">{state.meta.recordCount}</span>
                  <span className="overview__label">Insgesamt</span>
                </div>
              </section>

              <BaustellenFilter
                records={state.baustellen}
                filters={filters}
                onChange={setFilters}
                onReset={() => setFilters(EMPTY_FILTERS)}
              />

              <LocationControl location={location} />

              <PwaControls />

              <section className="results" aria-labelledby="results-heading">
                <div className="results__header">
                  <div>
                    <KernHeading level={2} id="results-heading">
                      Baustellen
                    </KernHeading>
                    <KernText muted aria-live="polite" aria-atomic="true">
                      {filtered.length === state.baustellen.length
                        ? `${filtered.length} Einträge`
                        : `${filtered.length} von ${state.baustellen.length} Einträgen`}
                    </KernText>
                  </div>
                  {!isEmptyFilters(filters) && (
                    <button
                      type="button"
                      className="results__reset"
                      onClick={() => setFilters(EMPTY_FILTERS)}
                    >
                      Alle Filter löschen
                    </button>
                  )}
                </div>

                {filtered.length > 0 ? (
                  <>
                    <div
                      className="view-switcher"
                      role="group"
                      aria-label="Darstellung wählen"
                    >
                      <button
                        type="button"
                        className="view-switcher__button"
                        aria-pressed={view === "map"}
                        onClick={() => setView("map")}
                      >
                        Karte
                      </button>
                      <button
                        type="button"
                        className="view-switcher__button"
                        aria-pressed={view === "list"}
                        onClick={() => setView("list")}
                      >
                        Liste
                      </button>
                    </div>

                    {view === "map" ? (
                      <BaustellenMap
                        records={filtered}
                        selectedId={selectedId}
                        currentLocation={
                          location.state.status === "ready"
                            ? location.state.point
                            : undefined
                        }
                        onSelect={setSelectedId}
                        onShowList={() => setView("list")}
                      />
                    ) : (
                      <BaustellenTable
                        records={filtered}
                        currentLocation={
                          location.state.status === "ready"
                            ? location.state.point
                            : undefined
                        }
                        onShowOnMap={(id) => {
                          setSelectedId(id);
                          setView("map");
                        }}
                      />
                    )}
                  </>
                ) : (
                  <KernAlert variant="info" title="Keine passenden Baustellen">
                    <KernText>
                      Ändern Sie Ihre Suche oder löschen Sie die gewählten Filter.
                    </KernText>
                  </KernAlert>
                )}
              </section>

              <footer className="app-footer">
                <details className="kern-accordion app-footer__details">
                  <summary className="kern-accordion__header">
                    <span className="kern-title">Datenquelle und Hinweise</span>
                  </summary>
                  <section className="kern-accordion__body">
                    <KernText>
                      Daten: {state.meta.source.name}. Quellen:{" "}
                      {state.meta.attribution.join(", ")}. Letzte Aktualisierung:{" "}
                      {new Date(state.meta.fetchedAt).toLocaleString("de-DE")}.
                    </KernText>
                    <KernLink
                      href="https://mobil.trk.de/"
                      label="Zum Mobilitätsportal der TRK"
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
