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
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  const municipalities = useMemo(
    () => distinctMunicipalities(records),
    [records],
  );
  const categories = useMemo(
    () =>
      distinctCategories(records).sort((a, b) =>
        categoryLabel(a).localeCompare(categoryLabel(b), "de"),
      ),
    [records],
  );

  return (
    <section className="filter-panel" aria-labelledby="filter-heading">
      <div className="filter-panel__heading">
        <div>
          <KernHeading level={2} id="filter-heading">
            Suchen und filtern
          </KernHeading>
        </div>
        {!isEmptyFilters(filters) && (
          <KernButton
            type="button"
            variant="tertiary"
            label="Zurücksetzen"
            onClick={onReset}
          />
        )}
      </div>

      <div className="filter-panel__primary">
        <KernInput
          id="filter-search"
          type="search"
          label="Straße, Ort oder Stichwort"
          hint="Zum Beispiel „Karlsruhe“ oder „Hauptstraße“"
          value={filters.search}
          onChange={(e) => set("search", e.currentTarget.value)}
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
                onClick={() => set("phase", option.value)}
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
          <span className="kern-title">Weitere Filter</span>
        </summary>
        <section className="kern-accordion__body filter-panel__grid">
          <KernSelect
            id="filter-municipality"
            label="Ort"
            value={filters.municipality}
            onChange={(e) => set("municipality", e.currentTarget.value)}
          >
            <option value="">Alle Orte</option>
            {municipalities.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </KernSelect>

          <KernSelect
            id="filter-category"
            label="Art der Baustelle"
            value={filters.category}
            onChange={(e) =>
              set("category", e.currentTarget.value as Filters["category"])
            }
          >
            <option value="">Alle Arten</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </KernSelect>

          <KernSelect
            id="filter-closure"
            label="Verkehrsauswirkung"
            value={filters.closure}
            onChange={(e) =>
              set("closure", e.currentTarget.value as Filters["closure"])
            }
          >
            <option value="">Alle Auswirkungen</option>
            {CLOSURE_VALUES.map((c) => (
              <option key={c} value={c}>
                {closureLabel(c)}
              </option>
            ))}
          </KernSelect>
        </section>
      </details>
    </section>
  );
}
