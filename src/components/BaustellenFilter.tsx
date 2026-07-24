import { useMemo, useState } from "react";
import {
  KernButton,
  KernHeading,
  KernInput,
  KernSelect,
} from "@kern-ux-annex/kern-react-kit";
import type { Baustelle } from "../types/index.ts";
import {
  CLOSURE_VALUES,
  PHASE_VALUES,
  categoryLabel,
  closureLabel,
  phaseLabel,
} from "../lib/labels.ts";
import {
  distinctCategories,
  distinctMunicipalities,
  isEmptyFilters,
  type Filters,
} from "../lib/filter.ts";

interface Props {
  records: Baustelle[];
  filters: Filters;
  onChange: (filters: Filters) => void;
  onReset: () => void;
}

/**
 * Controlled filter bar. Options for Ort/Art are derived from the data (so only
 * values that actually occur are offered); Status/Sperrung use the fixed enums.
 */
export function BaustellenFilter({ records, filters, onChange, onReset }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(filters.municipality || filters.category || filters.closure),
  );
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  const municipalities = useMemo(
    () => distinctMunicipalities(records),
    [records],
  );
  const categories = useMemo(
    () =>
      distinctCategories(records).sort((left, right) =>
        categoryLabel(left).localeCompare(categoryLabel(right), "de"),
      ),
    [records],
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
          {!isEmptyFilters(filters) && (
            <KernButton
              type="button"
              variant="tertiary"
              label="Zurücksetzen"
              onClick={onReset}
            />
          )}
        </div>
      </div>

      <div className="filter-panel__primary">
        <KernInput
          id="filter-search"
          type="search"
          label="Straße, Ort oder Stichwort"
          hint="Zum Beispiel „Karlsruhe“ oder „Hauptstraße“"
          value={filters.search}
          onChange={(event) => setFilter("search", event.currentTarget.value)}
        />

        <fieldset className="phase-filter">
          <legend>Status</legend>
          <div className="phase-filter__options">
            {[
              { value: "" as const, label: "Alle" },
              ...PHASE_VALUES.map((value) => ({
                value,
                label: phaseLabel(value),
              })),
            ].map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                className="phase-filter__button"
                aria-pressed={filters.phase === option.value}
                onClick={() => setFilter("phase", option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
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
                event.currentTarget.value as Filters["category"],
              )
            }
          >
            <option value="">Alle Arten</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {categoryLabel(category)}
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
                event.currentTarget.value as Filters["closure"],
              )
            }
          >
            <option value="">Alle Auswirkungen</option>
            {CLOSURE_VALUES.map((closure) => (
              <option key={closure} value={closure}>
                {closureLabel(closure)}
              </option>
            ))}
          </KernSelect>
        </section>
      </details>
    </section>
  );
}
