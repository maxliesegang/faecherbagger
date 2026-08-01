import type { ConstructionSite, ISODate } from "../types/index.ts";

/**
 * Relevance windows over the construction period.
 *
 * `phase` answers "which source layer is this from", which is not the same
 * question as "does this affect me soon": an `active` record may have started in
 * 2020 and an `upcoming` one may start in a year. These windows filter on the
 * dates instead, without recalculating `phase`.
 */
export type ConstructionSiteTimeframe = "" | "today" | "week" | "month";

/** Days after today each window still covers; `today` covers only today. */
const TIMEFRAME_DAYS: Record<Exclude<ConstructionSiteTimeframe, "">, number> = {
  today: 0,
  week: 6,
  month: 29,
};

export const CONSTRUCTION_SITE_TIMEFRAMES: readonly {
  value: Exclude<ConstructionSiteTimeframe, "">;
  label: string;
}[] = [
  { value: "today", label: "Heute betroffen" },
  { value: "week", label: "Diese Woche" },
  { value: "month", label: "Nächste 30 Tage" },
];

const TIMEFRAME_VALUES = CONSTRUCTION_SITE_TIMEFRAMES.map(
  (timeframe) => timeframe.value,
);

/** Every window value (for validating a filter value from the URL). */
export const CONSTRUCTION_SITE_TIMEFRAME_VALUES: readonly Exclude<
  ConstructionSiteTimeframe,
  ""
>[] = TIMEFRAME_VALUES;

const BERLIN_CALENDAR_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Today's calendar date in Europe/Berlin, so the windows line up with the
 * date-only source values regardless of the visitor's device timezone.
 */
export const getBerlinCalendarDate = (instant: Date = new Date()): ISODate =>
  BERLIN_CALENDAR_DATE.format(instant); // en-CA formats as YYYY-MM-DD

/** Shifts a date-only string by whole days; UTC arithmetic keeps it DST-safe. */
export function addCalendarDays(isoDate: ISODate, days: number): ISODate {
  const shifted = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(shifted.getTime())) return isoDate;
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * True when the site's period overlaps the window, treating a missing `endDate`
 * as open-ended. Lexicographic comparison is valid for `YYYY-MM-DD`.
 */
export function isConstructionSiteInTimeframe(
  constructionSite: ConstructionSite,
  timeframe: ConstructionSiteTimeframe,
  today: ISODate,
): boolean {
  if (!timeframe) return true;
  const windowEnd = addCalendarDays(today, TIMEFRAME_DAYS[timeframe]);
  if (constructionSite.startDate > windowEnd) return false;
  return constructionSite.endDate === null || constructionSite.endDate >= today;
}

/**
 * Human phrasing for how the period relates to today, e.g. "noch 3 Wochen" or
 * "beginnt in 4 Tagen". Returns `null` when nothing useful can be said, so
 * callers can fall back to the plain date range on its own.
 */
export function formatConstructionPeriodRelativeToToday(
  constructionSite: ConstructionSite,
  today: ISODate,
): string | null {
  const { startDate, endDate } = constructionSite;

  if (startDate > today) {
    const days = countDaysBetween(today, startDate);
    if (days === 1) return "beginnt morgen";
    if (days <= 30) return `beginnt in ${days} Tagen`;
    return null;
  }

  if (endDate === null) return "läuft, Ende offen";
  if (endDate < today) return "Zeitraum überschritten";

  const days = countDaysBetween(today, endDate);
  if (days === 0) return "läuft, endet heute";
  if (days === 1) return "läuft, endet morgen";
  if (days < 14) return `läuft, noch ${days} Tage`;
  if (days < 60) return `läuft, noch ${Math.round(days / 7)} Wochen`;
  return null;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function countDaysBetween(from: ISODate, to: ISODate): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / MILLISECONDS_PER_DAY);
}
