import { useMemo, useState, type ReactNode } from "react";
import {
  KernButton,
  KernSelect,
} from "@kern-ux-annex/kern-react-kit";
import type { ConstructionPhase, ConstructionSite } from "../types/index.ts";
import {
  CLOSURE_SEVERITIES,
  getConstructionCategoryLabel,
  getClosureLabel,
} from "../lib/construction-site-labels.ts";
import {
  getConstructionSiteCategoryOptions,
  getConstructionSiteMunicipalityOptions,
  hasNoConstructionSiteFilters,
  type ConstructionSiteFilters,
} from "../lib/construction-site-filter.ts";
import {
  CONSTRUCTION_SITE_TIMEFRAMES,
  type ConstructionSiteTimeframe,
} from "../lib/construction-site-timeframe.ts";

interface ConstructionSiteFilterProps {
  constructionSites: readonly ConstructionSite[];
  filters: ConstructionSiteFilters;
  /** Matches per phase for the current query, ignoring the phase filter. */
  phaseCounts: { total: number; active: number; upcoming: number };
  showOnlyChanged: boolean;
  changedCount: number;
  onFiltersChange: (filters: ConstructionSiteFilters) => void;
  onShowOnlyChangedChange: (showOnlyChanged: boolean) => void;
  onFiltersReset: () => void;
  locationControl: ReactNode;
}

const PHASE_OPTIONS: readonly {
  value: ConstructionPhase | "";
  label: string;
  kind: string;
}[] = [
  { value: "", label: "Alle", kind: "total" },
  { value: "active", label: "Aktuell", kind: "active" },
  { value: "upcoming", label: "Geplant", kind: "upcoming" },
];

const getTimeframeLabel = (timeframe: ConstructionSiteTimeframe): string =>
  CONSTRUCTION_SITE_TIMEFRAMES.find(
    (candidate) => candidate.value === timeframe,
  )?.label ?? "";

/** A one-click-removable summary of a narrowing filter that is in effect. */
interface FilterChip {
  key: "search" | "municipality" | "category" | "closure" | "timeframe";
  label: string;
}

/**
 * Search and status stay visible; narrowing filters open on demand. Options
 * for municipality and category come from the committed construction sites.
 */
export function ConstructionSiteFilter({
  constructionSites,
  filters,
  phaseCounts,
  showOnlyChanged,
  changedCount,
  onFiltersChange,
  onShowOnlyChangedChange,
  onFiltersReset,
  locationControl,
}: ConstructionSiteFilterProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const setFilter = <K extends keyof ConstructionSiteFilters>(
    key: K,
    value: ConstructionSiteFilters[K],
  ) => onFiltersChange({ ...filters, [key]: value });

  const municipalities = useMemo(
    () => getConstructionSiteMunicipalityOptions(constructionSites),
    [constructionSites],
  );
  const categories = useMemo(
    () =>
      getConstructionSiteCategoryOptions(constructionSites).sort((left, right) =>
        getConstructionCategoryLabel(left).localeCompare(
          getConstructionCategoryLabel(right),
          "de",
        ),
      ),
    [constructionSites],
  );

  const advancedFilterCount = [
    filters.municipality,
    filters.category,
    filters.closure,
    filters.timeframe,
    showOnlyChanged,
  ].filter(Boolean).length;
  const activeChips: FilterChip[] = [];
  if (filters.search.trim()) {
    activeChips.push({
      key: "search",
      label: `Suche: „${filters.search.trim()}“`,
    });
  }
  if (filters.timeframe) {
    activeChips.push({
      key: "timeframe",
      label: getTimeframeLabel(filters.timeframe),
    });
  }
  if (filters.municipality) {
    activeChips.push({ key: "municipality", label: filters.municipality });
  }
  if (filters.category) {
    activeChips.push({
      key: "category",
      label: getConstructionCategoryLabel(filters.category),
    });
  }
  if (filters.closure) {
    activeChips.push({
      key: "closure",
      label: getClosureLabel(filters.closure),
    });
  }
  const isUnfiltered =
    hasNoConstructionSiteFilters(filters) && !showOnlyChanged;
  const countForPhase = (phase: ConstructionPhase | "") =>
    phase === "" ? phaseCounts.total : phaseCounts[phase];

  return (
    <section className="filter-panel" aria-labelledby="filter-heading">
      <h2 id="filter-heading" className="kern-sr-only">Baustellen suchen und filtern</h2>
      <div className="filter-panel__primary">
        <div className="filter-panel__search">
          <label className="kern-label kern-sr-only" htmlFor="filter-search">Straße oder Ort suchen</label>
          <input
            className="kern-form-input__input"
            id="filter-search"
            type="search"
            placeholder="Straße oder Ort suchen"
            value={filters.search}
            onChange={(event) => setFilter("search", event.currentTarget.value)}
          />
        </div>
        {locationControl}
      </div>
      <div className="filter-panel__secondary">
        {/*
          Native radios: the three counts are mutually exclusive, so the platform
          should say so and arrow keys should move between them. The input stays
          in the accessibility tree and only its box is hidden; the tile is the
          label, which is what makes the whole surface clickable.
        */}
        <fieldset className="phase-switch">
          <legend className="kern-sr-only">Nach Status filtern</legend>
          {PHASE_OPTIONS.map((option) => (
            <label
              key={option.kind}
              className={`phase-switch__item phase-switch__item--${option.kind}`}
            >
              <input
                className="phase-switch__input kern-sr-only"
                type="radio"
                name="filter-phase"
                value={option.value}
                checked={filters.phase === option.value}
                onChange={() => setFilter("phase", option.value)}
              />
              <span className="phase-switch__label">{option.label}</span>
              <span className="phase-switch__value">{countForPhase(option.value)}</span>
            </label>
          ))}
        </fieldset>

        <details
          className="kern-accordion filter-panel__advanced"
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          {/*
            A real heading, so the section shows up when a screen reader lists the
            page's structure. KERN's own accordion renders a plain span here and
            offers no controlled open state, hence the hand-written markup.
          */}
          <summary className="kern-accordion__header">
            <h3 className="kern-title">
              Filter
              {advancedFilterCount > 0 && (
                <span className="filter-panel__active-count">
                  {advancedFilterCount} aktiv
                </span>
              )}
            </h3>
          </summary>
          <section className="kern-accordion__body filter-panel__grid">
            <div className="filter-panel__timeframe">
              <KernSelect
                id="filter-timeframe"
                label="Zeitraum"
                value={filters.timeframe}
                onChange={(event) =>
                  setFilter(
                    "timeframe",
                    event.currentTarget.value as ConstructionSiteTimeframe,
                  )
                }
              >
                <option value="">Alle Zeiträume</option>
                {CONSTRUCTION_SITE_TIMEFRAMES.map((timeframe) => (
                  <option key={timeframe.value} value={timeframe.value}>
                    {timeframe.label}
                  </option>
                ))}
              </KernSelect>
            </div>

            <button
              type="button"
              className="filter-panel__scope"
              aria-pressed={showOnlyChanged}
              disabled={changedCount === 0 && !showOnlyChanged}
              onClick={() => onShowOnlyChangedChange(!showOnlyChanged)}
            >
              Nur neu oder geändert
              <span className="filter-panel__scope-count">{changedCount}</span>
            </button>

            <KernSelect
              id="filter-municipality"
              label="Ort"
              value={filters.municipality}
              onChange={(event) =>
                setFilter("municipality", event.currentTarget.value)
              }
            >
              <option value="">Alle Orte</option>
              {municipalities.map((municipality) => (
                <option key={municipality} value={municipality}>
                  {municipality}
                </option>
              ))}
            </KernSelect>

            <KernSelect
              id="filter-category"
              label="Art der Baustelle"
              value={filters.category}
              onChange={(event) =>
                setFilter(
                  "category",
                  event.currentTarget
                    .value as ConstructionSiteFilters["category"],
                )
              }
            >
              <option value="">Alle Arten</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {getConstructionCategoryLabel(category)}
                </option>
              ))}
            </KernSelect>

            <KernSelect
              id="filter-closure"
              label="Verkehrsauswirkung"
              value={filters.closure}
              onChange={(event) =>
                setFilter(
                  "closure",
                  event.currentTarget.value as ConstructionSiteFilters["closure"],
                )
              }
            >
              <option value="">Alle Auswirkungen</option>
              {CLOSURE_SEVERITIES.map((closure) => (
                <option key={closure} value={closure}>
                  {getClosureLabel(closure)}
                </option>
              ))}
            </KernSelect>
          </section>
        </details>
        {!isUnfiltered && (
          <KernButton
            type="button"
            variant="tertiary"
            label="Zurücksetzen"
            onClick={onFiltersReset}
          />
        )}
      </div>
      {activeChips.length > 0 && (
        <ul className="filter-chips" aria-label="Aktive Filter">
          {activeChips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                className="filter-chips__chip"
                onClick={() => setFilter(chip.key, "")}
              >
                <span className="filter-chips__label">{chip.label}</span>
                <span className="filter-chips__remove" aria-hidden="true">
                  ×
                </span>
                <span className="kern-sr-only">Filter entfernen</span>
              </button>
            </li>
          ))}
        </ul>
      )}

    </section>
  );
}
