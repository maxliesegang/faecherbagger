import { useMemo, useState } from "react";
import {
  KernButton,
  KernHeading,
  KernInput,
  KernSelect,
} from "@kern-ux-annex/kern-react-kit";
import type { ConstructionSite } from "../types/index.ts";
import {
  CLOSURE_SEVERITIES,
  getConstructionCategoryLabel,
  getClosureLabel,
} from "../lib/construction-site-labels.ts";
import {
  getCategoryOptions,
  getMunicipalityOptions,
  hasNoConstructionSiteFilters,
  type ConstructionSiteFilters,
} from "../lib/construction-site-filter.ts";

interface ConstructionSiteFilterProps {
  constructionSites: readonly ConstructionSite[];
  filters: ConstructionSiteFilters;
  onFiltersChange: (filters: ConstructionSiteFilters) => void;
  onFiltersReset: () => void;
}

/**
 * Controlled filter bar. Options for Ort/Art are derived from the data (so only
 * values that actually occur are offered); Status/Sperrung use the fixed enums.
 */
export function ConstructionSiteFilter({
  constructionSites,
  filters,
  onFiltersChange,
  onFiltersReset,
}: ConstructionSiteFilterProps) {
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(filters.municipality || filters.category || filters.closure),
  );
  const setFilter = <K extends keyof ConstructionSiteFilters>(
    key: K,
    value: ConstructionSiteFilters[K],
  ) => onFiltersChange({ ...filters, [key]: value });

  const municipalities = useMemo(
    () => getMunicipalityOptions(constructionSites),
    [constructionSites],
  );
  const categories = useMemo(
    () =>
      getCategoryOptions(constructionSites).sort((left, right) =>
        getConstructionCategoryLabel(left).localeCompare(getConstructionCategoryLabel(right), "de"),
      ),
    [constructionSites],
  );
  const advancedFilterCount = [
    filters.municipality,
    filters.category,
    filters.closure,
  ].filter(Boolean).length;

  return (
    <section className="filter-panel" aria-labelledby="filter-heading">
      <div className="filter-panel__heading">
        <div>
          <KernHeading level={2} id="filter-heading">
            Baustelle finden
          </KernHeading>
        </div>
        <div className="filter-panel__heading-actions">
          <span className="filter-panel__shortcut" aria-hidden="true">
            <kbd>/</kbd> Suche
          </span>
          {!hasNoConstructionSiteFilters(filters) && (
            <KernButton
              type="button"
              variant="tertiary"
              label="Zurücksetzen"
              onClick={onFiltersReset}
            />
          )}
        </div>
      </div>

      <div className="filter-panel__search">
        <KernInput
          id="filter-search"
          type="search"
          label="Straße, Ort oder Stichwort"
          hint="Zum Beispiel „Karlsruhe“ oder „Hauptstraße“"
          value={filters.search}
          onChange={(event) => setFilter("search", event.currentTarget.value)}
        />
      </div>

      <details
        className="kern-accordion filter-panel__advanced"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary className="kern-accordion__header">
          <span className="kern-title">
            Weitere Filter
            {advancedFilterCount > 0 && (
              <span className="filter-panel__active-count">
                {advancedFilterCount} aktiv
              </span>
            )}
          </span>
        </summary>
        <section className="kern-accordion__body filter-panel__grid">
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
    </section>
  );
}
