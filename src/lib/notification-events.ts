import type {
  ConstructionSite,
  ConstructionSiteChanges,
  ISODate,
  LngLat,
  NotificationArea,
  NotificationFeed,
  NotificationFeedEvent,
  NotificationPreferences,
} from "../types/index.ts";
import { distanceInMeters } from "./distance.ts";
import { meetsSeverityThreshold } from "./notification-preferences.ts";
import {
  addCalendarDays,
  toBerlinCalendarDate,
  getBerlinCalendarDate,
  countDaysBetween,
  SHORT_NOTICE_LEAD_DAYS,
} from "./construction-site-timeframe.ts";

/**
 * Turns a pipeline run into the things worth announcing, and decides which of
 * them a given device should actually show.
 *
 * Both halves are pure and run in two places: the pipeline produces the events
 * at build time, the service worker selects from them at push time. The rules
 * for "is this worth a notification" are the product, so they live in one
 * tested place rather than inside a script or a worker.
 */

/** How far ahead a start is announced. Two chances to hear about it. */
export const STARTS_SOON_LEAD_DAYS: readonly number[] = [
  SHORT_NOTICE_LEAD_DAYS,
  1,
];

const toFeedEvent = (
  kind: NotificationFeedEvent["kind"],
  site: ConstructionSite,
  signature: string,
  announcedOn: ISODate,
): NotificationFeedEvent => ({
  kind,
  signature,
  announcedOn,
  siteId: site.id,
  point: site.point,
  closure: site.closure,
  startDate: site.startDate,
  endDate: site.endDate,
  municipality: site.municipality,
  location: site.location,
});

/**
 * Every event this run produced, before any device's preferences apply.
 *
 * `changes.since === null` means there is no previous run to compare against —
 * on a first run every record would look new, so only date-derived events fire.
 */
export function collectNotificationEvents(
  constructionSites: readonly ConstructionSite[],
  changes: Readonly<ConstructionSiteChanges>,
  today: ISODate,
): NotificationFeedEvent[] {
  const sitesById = new Map(constructionSites.map((site) => [site.id, site]));
  const events: NotificationFeedEvent[] = [];

  if (changes.since !== null) {
    for (const id of changes.added) {
      const site = sitesById.get(id);
      if (site) events.push(toFeedEvent("new", site, `new:${id}`, today));
    }
    for (const modification of changes.relevantModifications) {
      const site = sitesById.get(modification.id);
      if (!site) continue;
      events.push({
        ...toFeedEvent(
          "changed",
          site,
          `changed:${site.id}:${site.lastModified}`,
          today,
        ),
        previousClosure: modification.previousClosure,
        previousStartDate: modification.previousStartDate,
      });
    }
  }

  // Include thresholds crossed since the last successful fetch. Reminders remain
  // useful until the start. Preserve both thresholds after a longer outage so
  // disabling the optional day-before reminder cannot suppress the first one.
  const previousDay = changes.since
    ? toBerlinCalendarDate(changes.since)
    : today;
  const newIds = new Set(changes.since === null ? [] : changes.added);
  for (const site of constructionSites) {
    if (newIds.has(site.id) || site.startDate < today) continue;
    for (const leadDays of STARTS_SOON_LEAD_DAYS) {
      const dueOn = addCalendarDays(site.startDate, -leadDays);
      if (dueOn !== today && !(dueOn > previousDay && dueOn < today)) continue;
      events.push({
        ...toFeedEvent(
          "starts-soon",
          site,
          `starts-soon:${site.id}:${site.startDate}:${leadDays}`,
          today,
        ),
        reminderLeadDays: leadDays,
      });
    }
  }

  events.sort((left, right) => left.signature.localeCompare(right.signature));
  return events;
}

/** Keep three days of events so quiet hours and delayed delivery lose no run. */
export function createNotificationFeed(
  events: readonly NotificationFeedEvent[],
  generatedAt: string,
  previousFeed?: NotificationFeed | null,
  constructionSites?: readonly ConstructionSite[],
): NotificationFeed {
  const today = toBerlinCalendarDate(generatedAt);
  const earliestDay = addCalendarDays(today, -3);
  const currentSites = constructionSites
    ? new Map(
        constructionSites.map((constructionSite) => [
          constructionSite.id,
          constructionSite,
        ]),
      )
    : undefined;
  const retained = (previousFeed?.events ?? [])
    .filter((event) => {
      const announcedOn =
        event.announcedOn ?? toBerlinCalendarDate(previousFeed!.generatedAt);
      if (announcedOn < earliestDay) return false;
      if (!currentSites) return true;
      const constructionSite = currentSites.get(event.siteId);
      if (!constructionSite) return false;
      // A postponed start invalidates an old reminder; never announce stale dates.
      return (
        constructionSite.startDate === event.startDate &&
        constructionSite.endDate === event.endDate &&
        constructionSite.closure === event.closure
      );
    })
    .map((event) => ({
      ...event,
      announcedOn:
        event.announcedOn ?? toBerlinCalendarDate(previousFeed!.generatedAt),
    }));
  const eventsBySignature = new Map<string, NotificationFeedEvent>(
    retained.map((event) => [event.signature, event]),
  );
  for (const event of events) {
    if (!eventsBySignature.has(event.signature))
      eventsBySignature.set(event.signature, event);
  }
  return {
    generatedAt,
    events: [...eventsBySignature.values()].sort((left, right) =>
      left.signature.localeCompare(right.signature),
    ),
  };
}

export const isPointInNotificationArea = (
  area: NotificationArea,
  point: LngLat,
): boolean => distanceInMeters(area.center, point) <= area.radiusKm * 1_000;

/** The first area containing the point, or `undefined` when none does. */
export const findNotificationAreaForPoint = (
  areas: readonly NotificationArea[],
  point: LngLat,
): NotificationArea | undefined =>
  areas.find((area) => isPointInNotificationArea(area, point));

/**
 * The subset of `events` a device with these preferences should be shown.
 *
 * Two ways through, because they answer different questions. A site qualifies
 * by *discovery* — a kind that was asked for, disruptive enough, inside one of
 * the watched areas — or by having been *followed* by hand, which skips the
 * area and severity tests entirely: following a site is an explicit statement
 * that this one matters, and re-filtering it by rules meant for discovery would
 * drop exactly what was asked for. The kind still applies either way, so
 * someone who turned `changed` off does not get change notices through the back
 * door.
 *
 * This is the whole reason the server can stay ignorant of anyone's location —
 * it runs on the device, after the push has arrived.
 */
export function selectNotificationEvents(
  events: readonly NotificationFeedEvent[],
  preferences: NotificationPreferences,
  today: ISODate = getBerlinCalendarDate(),
): NotificationFeedEvent[] {
  const followed = new Set(preferences.followedSiteIds);
  if (preferences.areas.length === 0 && followed.size === 0) return [];
  return events.filter((event) => {
    if (!preferences.kinds.includes(event.kind)) return false;
    if (event.kind === "starts-soon" && event.startDate < today) return false;
    if (
      event.kind === "starts-soon" &&
      event.reminderLeadDays === 1 &&
      preferences.remindDayBefore === false
    )
      return false;
    const isFollowed = followed.has(event.siteId);
    const isEarly =
      countDaysBetween(today, event.startDate) > SHORT_NOTICE_LEAD_DAYS;
    const wasStartingSoon =
      event.previousStartDate !== undefined &&
      countDaysBetween(today, event.previousStartDate) <=
        SHORT_NOTICE_LEAD_DAYS;
    if (!isFollowed && !preferences.notifyEarly && isEarly && !wasStartingSoon)
      return false;
    if (event.kind === "new" && event.endDate !== null && event.endDate < today)
      return false;
    if (isFollowed) return true;
    return (
      (meetsSeverityThreshold(event.closure, preferences.minSeverity) ||
        (event.kind === "changed" &&
          event.previousClosure !== undefined &&
          meetsSeverityThreshold(
            event.previousClosure,
            preferences.minSeverity,
          ))) &&
      findNotificationAreaForPoint(preferences.areas, event.point) !== undefined
    );
  });
}
