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

/**
 * What each category means on the street, for people who do not work in road
 * administration. The source's `art` vocabulary names the *trade* ("Bauliche
 * Sondernutzung"), which says nothing about what a resident will encounter.
 *
 * Kept short enough to sit under the label without becoming a second paragraph.
 */
const CATEGORY_DESCRIPTIONS: Record<ConstructionCategory, string> = {
  "special-use": "Gerüst, Container, Kran o. Ä. beansprucht die Straße",
  "power-telecom": "Arbeiten an Strom- oder Telefon- und Internetleitungen",
  "district-heating": "Arbeiten an Fernwärmeleitungen im Untergrund",
  "gas-water": "Arbeiten an Gas- oder Wasserleitungen im Untergrund",
  "road-construction": "Die Straße selbst wird gebaut oder umgebaut",
  "road-maintenance": "Ausbesserung der Fahrbahn, meist kürzer",
  sewer: "Arbeiten an der Kanalisation unter der Straße",
  rail: "Arbeiten an Straßenbahn- oder Bahngleisen",
  bridge: "Arbeiten an einer Brücke",
  tunnel: "Arbeiten in oder an einem Tunnel",
  "retaining-wall": "Arbeiten an einer Stützmauer am Straßenrand",
  demolition: "Ein Gebäude oder Bauwerk wird abgerissen",
  "stop-rebuild": "Eine Haltestelle wird umgebaut",
  "traffic-reroute": "Der Verkehr wird wegen einer Baustelle anders geführt",
  crane: "Ein Kran steht auf oder an der Straße",
  "soil-survey": "Der Untergrund wird untersucht, meist kurz",
  "green-maintenance": "Pflege von Bäumen und Grünflächen am Straßenrand",
  other: "Sonstige Arbeiten im Straßenraum",
};

/**
 * The question a visitor actually arrives with: can I get through here? Phrased
 * as an answer rather than as the source's category name.
 */
const CLOSURE_HEADLINES: Record<ClosureSeverity, string> = {
  none: "Sie kommen normal durch",
  obstruction: "Durchkommen möglich, aber behindert",
  "one-direction": "Eine Fahrtrichtung ist gesperrt",
  full: "Gesperrt – hier kommen Sie nicht durch",
  unknown: "Auswirkung auf den Verkehr nicht angegeben",
};

const CLOSURE_DESCRIPTIONS: Record<ClosureSeverity, string> = {
  none: "Die Arbeiten finden neben dem Verkehr statt.",
  obstruction:
    "Rechnen Sie mit verengter Fahrbahn, Wartezeit oder Umleitung für Gehweg und Radweg.",
  "one-direction":
    "Aus einer Richtung ist die Durchfahrt gesperrt; aus der anderen kommen Sie durch.",
  full: "Die Straße ist für den Durchgangsverkehr gesperrt. Planen Sie eine Umfahrung ein.",
  unknown:
    "Die Quelle macht keine Angabe. Rechnen Sie vorsichtshalber mit einer Einschränkung.",
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

/**
 * Marker colours for the map and its legend, keyed by closure severity.
 *
 * Severity rather than phase drives the colour: whether a road is passable is
 * the question a visitor brings to the map. Because a red/orange/amber ramp
 * collapses for red-green colour blindness, the map pairs these with a
 * severity-dependent marker size, and every list surface repeats the value as
 * text.
 */
export const CLOSURE_SEVERITY_COLORS: Record<ClosureSeverity, string> = {
  full: "#a4262c",
  "one-direction": "#c25e00",
  obstruction: "#8a6a00",
  none: "#2f6b3f",
  unknown: "#5c5c5c",
};

const PHASE_LABELS: Record<ConstructionPhase, string> = {
  active: "Aktuell",
  upcoming: "Geplant",
};

const PHASE_VARIANTS: Record<ConstructionPhase, BadgeVariant> = {
  active: "info",
  upcoming: "warning",
};

/** Every known category (for validating filter values from the URL). */
export const CONSTRUCTION_CATEGORIES = Object.keys(
  CATEGORY_LABELS,
) as ConstructionCategory[];

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
/** Plain-language explanation of a category, for surfaces that have the room. */
export const getConstructionCategoryDescription = (
  category: ConstructionCategory,
): string => CATEGORY_DESCRIPTIONS[category];
export const getClosureLabel = (closure: ClosureSeverity): string =>
  CLOSURE_LABELS[closure];
/** Answers "can I get through?" in one sentence. */
export const getClosureHeadline = (closure: ClosureSeverity): string =>
  CLOSURE_HEADLINES[closure];
/** What the headline means in practice, one sentence longer. */
export const getClosureDescription = (closure: ClosureSeverity): string =>
  CLOSURE_DESCRIPTIONS[closure];
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
export function formatISODate(isoDate: string): string {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (match) {
    const [, year, month, day] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const isValid =
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day);
    return isValid ? `${day}.${month}.${year}` : isoDate;
  }

  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? isoDate : DATE_FORMAT.format(date);
}

/** Formats an ISO timestamp for display; passes through invalid input. */
export function formatISOTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return Number.isNaN(date.getTime())
    ? isoTimestamp
    : TIMESTAMP_FORMAT.format(date);
}

/** Renders a start/end range; open-ended (`null` end) shows as `"ab <start>"`. */
export function formatConstructionPeriod(startDate: string, endDate: string | null): string {
  const start = formatISODate(startDate);
  return endDate ? `${start} – ${formatISODate(endDate)}` : `ab ${start}`;
}
