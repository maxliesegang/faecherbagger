import type { ConstructionSite, ISODate, ISOTimestamp } from "../types/index.ts";

/**
 * When a construction site happens, relative to the day the visitor is looking.
 *
 * Deliberately separate from {@link ConstructionPhase}: `phase` says which
 * source layer a record came from and must not be recalculated, while this says
 * what the dates mean today. Keeping them apart is what lets the app show a
 * record the source still lists as `active` whose `endDate` has passed as
 * `"ended"` without rewriting the source's own classification.
 */
export type ConstructionSiteTiming =
  | "running"
  | "starting-soon"
  | "later"
  | "ended";

/**
 * How far ahead a start still counts as short notice, in days — and equally how
 * long after a start the site is still news to someone who was away.
 *
 * The one number behind "kurzfristig": the surroundings screen's default list,
 * the push notification's lead sentence and the ranking all read it, so the app
 * cannot promise a week in one place and act on three days in another.
 */
export const SHORT_NOTICE_LEAD_DAYS = 7;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * `en-CA` because it formats as `YYYY-MM-DD`, which is the shape every date in
 * the dataset already has, so the comparison below is a string comparison.
 */
const BERLIN_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The calendar date a timestamp falls on in Karlsruhe.
 *
 * Anchored on the data's `fetchedAt` rather than the browser clock for the same
 * reason the recency window is: the machine looking at the app may sit in
 * another timezone, and "heute" has to mean the same day for everyone.
 */
export function toBerlinCalendarDate(timestamp: ISOTimestamp): ISODate {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : BERLIN_DATE_FORMAT.format(date);
}

const parseCalendarDate = (isoDate: ISODate): number =>
  Date.parse(`${isoDate}T00:00:00Z`);

/**
 * Whole days from `from` to `to`, positive when `to` lies later. Both sides are
 * date-only, so this counts calendar days and never fractions of one.
 */
export function differenceInCalendarDays(from: ISODate, to: ISODate): number {
  const start = parseCalendarDate(from);
  const end = parseCalendarDate(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return Number.NaN;
  return Math.round((end - start) / MILLISECONDS_PER_DAY);
}

/**
 * Days until the site starts: `0` today, negative once it is under way.
 *
 * `NaN` for an unparseable start date, which the callers treat as "no timing
 * statement" rather than guessing — a malformed date must not become a
 * confident "beginnt heute".
 */
export function getStartLeadDays(
  constructionSite: ConstructionSite,
  today: ISODate,
): number {
  return differenceInCalendarDays(today, constructionSite.startDate);
}

/**
 * The one place that classifies a record against a day. Every list, count and
 * badge derives from this, the same way every "neu" derives from
 * `getConstructionSiteRecency`.
 *
 * A record with a passed `endDate` is `"ended"` whatever the source layer says:
 * 12 of the current 515 records are in exactly that state, and offering them as
 * something to plan around is worse than omitting them.
 */
export function getConstructionSiteTiming(
  constructionSite: ConstructionSite,
  today: ISODate,
): ConstructionSiteTiming {
  if (constructionSite.endDate !== null && constructionSite.endDate < today) {
    return "ended";
  }
  const leadDays = getStartLeadDays(constructionSite, today);
  if (Number.isNaN(leadDays)) return "running";
  if (leadDays <= 0) return "running";
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
