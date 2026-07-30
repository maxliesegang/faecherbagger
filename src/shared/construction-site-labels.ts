import type {
  ConstructionCategory,
  ConstructionPhase,
  ConstructionSite,
  ClosureSeverity,
  ISODate,
} from "../types/index.ts";
import type { RecentWindowDays } from "../shared/recency.ts";
import {
  getConstructionSiteTiming,
  getStartLeadDays,
} from "./construction-site-timing.ts";

/**
 * German construction-site labels and badge variants for normalized enums.
 * UI-only: the pipeline works with the stable machine values in
 * `src/shared/construction-site-mappings.ts`; this module turns them into what the table shows.
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

/**
 * Both neutral. Colour on this screen means one thing — how badly traffic is
 * affected — and "Geplant" in the same yellow as "Mit Behinderung" spent the
 * warning colour on a fact that warns about nothing. Whether a record is current
 * or announced is now carried by {@link describeConstructionTiming}, which says
 * it far more precisely than a two-value badge could.
 */
const PHASE_VARIANTS: Record<ConstructionPhase, BadgeVariant> = {
  active: "info",
  upcoming: "info",
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

const startOfLocalDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calendar-day distance in German ("heute", "gestern", "vor 3 Tagen"), used for
 * change timestamps where the exact time of day is noise. `now` is a parameter
 * so the output is testable; falls back to the absolute timestamp when the
 * input cannot be parsed or lies in the future.
 */
export function formatRelativeDay(
  isoTimestamp: string,
  now: Date = new Date(),
): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;

  const days = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(date)) / MILLISECONDS_PER_DAY,
  );
  if (days < 0) return formatISOTimestamp(isoTimestamp);
  if (days === 0) return "heute";
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
}

const RECENT_WINDOW_LABELS: Record<RecentWindowDays, string> = {
  1: "24 Stunden",
  7: "7 Tage",
  30: "30 Tage",
};

/** The visitor-facing name of a time window, e.g. `"7 Tage"`. */
export function getRecentWindowLabel(windowDays: RecentWindowDays): string {
  return RECENT_WINDOW_LABELS[windowDays];
}

/** Renders a start/end range; open-ended (`null` end) shows as `"ab <start>"`. */
export function formatConstructionPeriod(startDate: string, endDate: string | null): string {
  const start = formatISODate(startDate);
  return endDate ? `${start} – ${formatISODate(endDate)}` : `ab ${start}`;
}

/** How the period ends, as the tail of a timing sentence. */
function describePeriodEnd(
  site: ConstructionSite,
  today: ISODate,
  isRunning: boolean,
): string {
  if (site.endDate === null) return "";
  if (site.endDate === site.startDate) return ", nur an diesem Tag";
  if (site.endDate === today) return ", endet heute";
  return isRunning
    ? `, noch bis ${formatISODate(site.endDate)}`
    : `, bis ${formatISODate(site.endDate)}`;
}

/**
 * The one sentence a card leads with: when this construction site happens,
 * measured from the day the visitor is looking rather than stated as two dates.
 *
 * "03.08.2026 – 03.08.2026" is data; "Beginnt in 4 Tagen, nur an diesem Tag" is
 * the same fact in the form the decision needs. The absolute dates stay on the
 * detail page and in the table, where the record is being read rather than
 * triaged.
 *
 * Spelled out per case rather than assembled from fragments, for the same
 * reason the surroundings counts are: German does not survive concatenation.
 */
export function describeConstructionTiming(
  site: ConstructionSite,
  today: ISODate,
): string {
  const timing = getConstructionSiteTiming(site, today);
  const leadDays = getStartLeadDays(site, today);

  if (Number.isNaN(leadDays)) {
    return formatConstructionPeriod(site.startDate, site.endDate);
  }

  if (timing === "ended") {
    return site.endDate
      ? `Abgeschlossen am ${formatISODate(site.endDate)}`
      : "Abgeschlossen";
  }

  if (timing === "running") {
    const start =
      leadDays === 0
        ? "Läuft seit heute"
        : leadDays === -1
          ? "Läuft seit gestern"
          : `Läuft seit ${-leadDays} Tagen`;
    return `${start}${describePeriodEnd(site, today, true)}`;
  }

  const start =
    leadDays === 1 ? "Beginnt morgen" : `Beginnt in ${leadDays} Tagen`;
  const named =
    timing === "later" ? `Beginnt am ${formatISODate(site.startDate)}` : start;
  return `${named}${describePeriodEnd(site, today, false)}`;
}
