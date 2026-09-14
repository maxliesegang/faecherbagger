import type {
  ConstructionSite,
  ISODate,
  ISOTimestamp,
} from "../types/index.ts";

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

/**
 * The calendar date a timestamp falls on in Karlsruhe.
 *
 * The counterpart to {@link getBerlinCalendarDate} for a value that already
 * exists: screens anchor "heute" on the dataset's own `fetchedAt` rather than on
 * the browser clock, so a device in another timezone — or one looking at data
 * fetched twelve hours ago — classifies records exactly as the pipeline did.
 */
export function toBerlinCalendarDate(timestamp: ISOTimestamp): ISODate {
  const instant = new Date(timestamp);
  return Number.isNaN(instant.getTime())
    ? timestamp
    : BERLIN_CALENDAR_DATE.format(instant);
}

/**
 * How far ahead a start still counts as short notice, in days — and equally how
 * long after a start the site is still news to someone who was away.
 *
 * The one number behind "kurzfristig": the relevance list, the notification
 * copy and the ranking all read it, so the app cannot promise a week in one
 * place and act on three days in another.
 */
export const SHORT_NOTICE_LEAD_DAYS = 7;

/**
 * When a construction site happens, relative to the day being looked at.
 *
 * Deliberately separate from `phase`, which says which source layer a record
 * came from and must not be recalculated. Keeping them apart lets a record the
 * source still lists as `active` whose `endDate` has passed read as `"ended"`
 * without rewriting the source's own classification.
 */
export type ConstructionSiteTiming =
  | "running"
  | "starting-soon"
  | "later"
  | "ended";

/**
 * Days until the site starts: `0` today, negative once it is under way.
 *
 * `NaN` for an unparseable start date, and deliberately not
 * {@link countDaysBetween}, which reports `0` instead — callers here treat
 * `NaN` as "no timing statement" rather than guessing, because a malformed date
 * must not become a confident "beginnt heute".
 */
export function getStartLeadDays(
  constructionSite: ConstructionSite,
  today: ISODate,
): number {
  const start = new Date(`${today}T00:00:00Z`).getTime();
  const end = new Date(`${constructionSite.startDate}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return Number.NaN;
  return Math.round((end - start) / MILLISECONDS_PER_DAY);
}

/**
 * The one place that classifies a record against a day. Every relevance list,
 * count and badge derives from this.
 *
 * A record with a passed `endDate` is `"ended"` whatever the source layer says:
 * the dataset carries a steady handful in exactly that state, and offering them
 * as something to plan around is worse than omitting them.
 */
export function getConstructionSiteTiming(
  constructionSite: ConstructionSite,
  today: ISODate,
): ConstructionSiteTiming {
  if (constructionSite.endDate !== null && constructionSite.endDate < today) {
    return "ended";
  }
  const leadDays = getStartLeadDays(constructionSite, today);
  if (Number.isNaN(leadDays) || leadDays <= 0) return "running";
  return leadDays <= SHORT_NOTICE_LEAD_DAYS ? "starting-soon" : "later";
}

/**
 * Whether the site is something to plan around this week: it starts within the
 * next {@link SHORT_NOTICE_LEAD_DAYS} days, or it started within the last that
 * many and is still running.
 *
 * This is the product. A visitor cannot re-plan a route around a Vollsperrung
 * announced for next March, and does not need telling about one that has been
 * in place since spring — what they need is the week around today.
 */
export function isShortNoticeConstructionSite(
  constructionSite: ConstructionSite,
  today: ISODate,
): boolean {
  const timing = getConstructionSiteTiming(constructionSite, today);
  if (timing === "ended" || timing === "later") return false;
  const leadDays = getStartLeadDays(constructionSite, today);
  if (Number.isNaN(leadDays)) return false;
  return Math.abs(leadDays) <= SHORT_NOTICE_LEAD_DAYS;
}

/**
 * Ranks short-notice sites: the ones starting soonest first, then the ones that
 * have just begun. `Math.abs` would tie "beginnt in 2 Tagen" with "läuft seit 2
 * Tagen"; something a visitor can still plan around outranks something they have
 * already driven into.
 */
export function compareByShortNoticeUrgency(
  left: ConstructionSite,
  right: ConstructionSite,
  today: ISODate,
): number {
  const rank = (constructionSite: ConstructionSite): number => {
    const leadDays = getStartLeadDays(constructionSite, today);
    if (Number.isNaN(leadDays)) return Number.MAX_SAFE_INTEGER;
    // Upcoming starts (0…7) sort ahead of starts already past (-1…-7).
    return leadDays >= 0 ? leadDays : SHORT_NOTICE_LEAD_DAYS - leadDays;
  };
  return rank(left) - rank(right);
}
