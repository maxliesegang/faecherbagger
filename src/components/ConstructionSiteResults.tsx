import { lazy, Suspense, useMemo, useState } from "react";
import {
  KernAlert,
  KernHeading,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type {
  ConstructionSite,
  ConstructionSiteChanges,
  LngLat,
  NotificationArea,
} from "../types/index.ts";
import { changedConstructionSiteIds } from "../lib/construction-site-changes.ts";
import {
  filterConstructionSites,
  type ConstructionSiteFilters,
} from "../lib/construction-site-filter.ts";
import { ConstructionSiteTable } from "./ConstructionSiteTable.tsx";

const ConstructionSiteMap = lazy(() =>
  import("./ConstructionSiteMap.tsx").then((module) => ({
    default: module.ConstructionSiteMap,
  })),
);

type ResultMode = "all" | "changed";
type ResultView = "map" | "list";

interface ConstructionSiteResultsProps {
  constructionSites: readonly ConstructionSite[];
  changes: Readonly<ConstructionSiteChanges>;
  filters: Readonly<ConstructionSiteFilters>;
  currentLocation?: LngLat;
  notificationArea?: NotificationArea;
}

function getInitialSelectedSiteId(): string | undefined {
  const id = new URLSearchParams(window.location.search).get("baustelle");
  return id || undefined;
}

/**
 * Owns filtering, change selection, and map/list navigation for the result set.
 * Keeping this state together prevents the page shell from depending on the
 * details of either result presentation.
 */
export function ConstructionSiteResults({
  constructionSites,
  changes,
  filters,
  currentLocation,
  notificationArea,
}: ConstructionSiteResultsProps) {
  const [resultMode, setResultMode] = useState<ResultMode>("all");
  const [resultView, setResultView] = useState<ResultView>("map");
  const [selectedSiteId, setSelectedSiteId] = useState<string | undefined>(
    getInitialSelectedSiteId,
  );

  const filteredConstructionSites = useMemo(
    () => filterConstructionSites(constructionSites, filters),
    [constructionSites, filters],
  );
  const changedSiteIds = useMemo(
    () => changedConstructionSiteIds(changes),
    [changes],
  );
  const displayedConstructionSites = useMemo(
    () =>
      resultMode === "changed"
        ? filteredConstructionSites.filter((site) =>
            changedSiteIds.has(site.id),
          )
        : filteredConstructionSites,
    [changedSiteIds, filteredConstructionSites, resultMode],
  );

  return (
    <section className="results" aria-labelledby="results-heading">
      <div className="results__header">
        <div className="results__summary">
          <KernHeading level={2} id="results-heading">
            Ergebnisse
          </KernHeading>
          <KernText muted aria-live="polite" aria-atomic="true">
            {resultMode === "changed"
              ? `${displayedConstructionSites.length} von ${changedSiteIds.size} Änderungen`
              : filteredConstructionSites.length === constructionSites.length
                ? `${filteredConstructionSites.length} Einträge`
                : `${filteredConstructionSites.length} von ${constructionSites.length} Einträgen`}
          </KernText>
        </div>
        <div className="results__controls">
          <div
            className="result-mode"
            role="group"
            aria-label="Ergebnisumfang wählen"
          >
            <button
              type="button"
              className="result-mode__button"
              aria-pressed={resultMode === "all"}
              onClick={() => setResultMode("all")}
            >
              Alle
            </button>
            <button
              type="button"
              className="result-mode__button"
              aria-pressed={resultMode === "changed"}
              onClick={() => setResultMode("changed")}
            >
              Neu/Geändert
              {changedSiteIds.size > 0 && (
                <span className="result-mode__count">{changedSiteIds.size}</span>
              )}
            </button>
          </div>
          {displayedConstructionSites.length > 0 && (
            <div
              className="view-switcher"
              role="group"
              aria-label="Darstellung wählen"
            >
              <button
                type="button"
                className="view-switcher__button"
                aria-pressed={resultView === "map"}
                onClick={() => setResultView("map")}
              >
                Karte
              </button>
              <button
                type="button"
                className="view-switcher__button"
                aria-pressed={resultView === "list"}
                onClick={() => setResultView("list")}
              >
                Liste
              </button>
            </div>
          )}
        </div>
      </div>

      {resultMode === "changed" && changes.since !== null && (
        <KernText muted className="results__change-summary">
          Seit {new Date(changes.since).toLocaleString("de-DE")}:{" "}
          {changes.added.length} neu, {changes.modified.length} geändert
          {changes.removed.length > 0 &&
            `, ${changes.removed.length} nicht mehr gelistet`}
          .
        </KernText>
      )}

      {displayedConstructionSites.length > 0 ? (
        resultView === "map" ? (
          <Suspense
            fallback={
              <div className="app-status" role="status" aria-live="polite">
                <span className="app-status__spinner" aria-hidden="true" />
                <KernText>Karte wird geladen …</KernText>
              </div>
            }
          >
            <ConstructionSiteMap
              constructionSites={displayedConstructionSites}
              selectedSiteId={selectedSiteId}
              currentLocation={currentLocation}
              notificationArea={notificationArea}
              onSiteSelect={setSelectedSiteId}
              onListViewRequest={() => setResultView("list")}
            />
          </Suspense>
        ) : (
          <ConstructionSiteTable
            constructionSites={displayedConstructionSites}
            currentLocation={currentLocation}
            onShowSiteOnMap={(siteId) => {
              setSelectedSiteId(siteId);
              setResultView("map");
            }}
          />
        )
      ) : (
        <KernAlert
          variant="info"
          title={
            resultMode === "changed"
              ? "Keine neuen oder geänderten Baustellen"
              : "Keine passenden Baustellen"
          }
        >
          <KernText>
            {resultMode === "changed" && changes.since === null
              ? "Für diesen Datenstand liegt noch kein vorheriger Vergleich vor."
              : resultMode === "changed"
                ? "Seit der vorherigen Aktualisierung gibt es für die gewählten Filter keine Änderungen."
                : "Ändern Sie Ihre Suche oder löschen Sie die gewählten Filter."}
          </KernText>
        </KernAlert>
      )}
    </section>
  );
}
