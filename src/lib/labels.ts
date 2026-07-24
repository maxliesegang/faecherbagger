import type { Category, ClosureSeverity, Phase } from "../types/index.ts";

/**
 * German display strings and badge variants for the normalized enums. These are
 * UI-only: the pipeline works with the stable machine values in
 * `src/lib/mappings.ts`; this module turns them into what the table shows.
 */

type BadgeVariant = "success" | "danger" | "warning" | "info";

const CATEGORY_LABELS: Record<Category, string> = {
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

const PHASE_LABELS: Record<Phase, string> = {
  active: "Aktuell",
  upcoming: "Geplant",
};

const PHASE_VARIANTS: Record<Phase, BadgeVariant> = {
  active: "info",
  upcoming: "warning",
};

/** All closure severities, most disruptive first (for filter dropdowns). */
export const CLOSURE_VALUES: ClosureSeverity[] = [
  "full",
  "one-direction",
  "obstruction",
  "none",
  "unknown",
];

/** Both phases, current first (for filter dropdowns). */
export const PHASE_VALUES: Phase[] = ["active", "upcoming"];

export const categoryLabel = (c: Category): string => CATEGORY_LABELS[c];
export const closureLabel = (c: ClosureSeverity): string => CLOSURE_LABELS[c];
export const closureVariant = (c: ClosureSeverity): BadgeVariant =>
  CLOSURE_VARIANTS[c];
export const phaseLabel = (p: Phase): string => PHASE_LABELS[p];
export const phaseVariant = (p: Phase): BadgeVariant => PHASE_VARIANTS[p];

const DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TIMESTAMP_FMT = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
});

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `"2026-07-24"` -> `"24.07.2026"`; passes through anything unparseable. */
export function formatDate(iso: string): string {
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
  return Number.isNaN(date.getTime()) ? iso : DATE_FMT.format(date);
}

/** Formats an ISO timestamp for display; passes through invalid input. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : TIMESTAMP_FMT.format(date);
}

/** Renders a start/end range; open-ended (`null` end) shows as `"ab <start>"`. */
export function formatPeriod(startDate: string, endDate: string | null): string {
  const start = formatDate(startDate);
  return endDate ? `${start} – ${formatDate(endDate)}` : `ab ${start}`;
}
