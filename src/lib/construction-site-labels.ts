import type {
  ConstructionCategory,
  ConstructionPhase,
  ClosureSeverity,
} from "../types/index.ts";

/**
 * German construction-site labels and badge variants for normalized enums.
 * UI-only: the pipeline works with the stable machine values in
 * `src/lib/construction-site-mappings.ts`; this module turns them into what the table shows.
 */

type BadgeVariant = "success" | "danger" | "warning" | "info";

const CATEGORY_LABELS: Record<ConstructionCategory, string> = {
  "special-use": "Bauliche Sondernutzung",
  "power-telecom": "Strom/TK-Versorgung",
  "district-heating": "Fernwärme",
  "gas-water": "Gas/Wasser",
  "road-construction": "Straßenbau",
  "road-maintenance": "Straßenunterhaltung",
  sewer: "Kanalbau",
  rail: "Gleisbau",
  bridge: "Brückenbau",
  tunnel: "Tunnel",
  "retaining-wall": "Stützwand",
  demolition: "Abbruch/Rückbau",
  "stop-rebuild": "Haltestellenumbau",
  "traffic-reroute": "Geänderte Verkehrsführung",
  crane: "Kraneinsatz",
  "soil-survey": "Baugrunduntersuchung",
  "green-maintenance": "Grünpflege",
  other: "Sonstiges",
};

const CLOSURE_LABELS: Record<ClosureSeverity, string> = {
  none: "Keine Behinderung",
  obstruction: "Mit Behinderung",
  "one-direction": "Sperrung (1 Richtung)",
  full: "Vollsperrung",
  unknown: "Unbekannt",
};

const CLOSURE_VARIANTS: Record<ClosureSeverity, BadgeVariant> = {
  none: "success",
  obstruction: "warning",
  "one-direction": "warning",
  full: "danger",
  unknown: "info",
};

const PHASE_LABELS: Record<ConstructionPhase, string> = {
  active: "Aktuell",
  upcoming: "Geplant",
};

const PHASE_VARIANTS: Record<ConstructionPhase, BadgeVariant> = {
  active: "info",
  upcoming: "warning",
};

/** All closure severities, most disruptive first (for filter dropdowns). */
export const CLOSURE_SEVERITIES: ClosureSeverity[] = [
  "full",
  "one-direction",
  "obstruction",
  "none",
  "unknown",
];

/** Both phases, current first (for filter dropdowns). */
export const CONSTRUCTION_PHASES: ConstructionPhase[] = ["active", "upcoming"];

export const getConstructionCategoryLabel = (category: ConstructionCategory): string =>
  CATEGORY_LABELS[category];
export const getClosureLabel = (closure: ClosureSeverity): string =>
  CLOSURE_LABELS[closure];
export const getClosureBadgeVariant = (closure: ClosureSeverity): BadgeVariant =>
  CLOSURE_VARIANTS[closure];
export const getConstructionPhaseLabel = (phase: ConstructionPhase): string =>
  PHASE_LABELS[phase];
export const getConstructionPhaseBadgeVariant = (phase: ConstructionPhase): BadgeVariant =>
  PHASE_VARIANTS[phase];

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
});

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `"2026-07-24"` -> `"24.07.2026"`; passes through anything unparseable. */
export function formatIsoDate(iso: string): string {
  const match = ISO_DATE_PATTERN.exec(iso);
  if (match) {
    const [, year, month, day] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const isValid =
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day);
    return isValid ? `${day}.${month}.${year}` : iso;
  }

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

/** Formats an ISO timestamp for display; passes through invalid input. */
export function formatIsoTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : TIMESTAMP_FORMAT.format(date);
}

/** Renders a start/end range; open-ended (`null` end) shows as `"ab <start>"`. */
export function formatConstructionPeriod(startDate: string, endDate: string | null): string {
  const start = formatIsoDate(startDate);
  return endDate ? `${start} – ${formatIsoDate(endDate)}` : `ab ${start}`;
}
