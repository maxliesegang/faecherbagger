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
import { addCalendarDays } from "./construction-site-timeframe.ts";

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
export const STARTS_SOON_LEAD_DAYS: readonly number[] = [7, 1];

const toFeedEvent = (
  kind: NotificationFeedEvent["kind"],
  site: ConstructionSite,
  signature: string,
): NotificationFeedEvent => ({
  kind,
  signature,
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
      if (site) events.push(toFeedEvent("new", site, `new:${id}`));
    }
    for (const modification of changes.relevantModifications) {
      const site = sitesById.get(modification.id);
      if (!site) continue;
      events.push(
        toFeedEvent("changed", site, `changed:${site.id}:${site.lastModified}`),
      );
    }
  }

  // Start reminders come from the dates alone, so they also cover sites that
  // were announced long before anyone subscribed.
  const reminderDates = new Set(
    STARTS_SOON_LEAD_DAYS.map((days) => addCalendarDays(today, days)),
  );
  const newIds = new Set(changes.since === null ? [] : changes.added);
  for (const site of constructionSites) {
    if (!reminderDates.has(site.startDate)) continue;
    // A site announced today already said "ab <date>" in its `new` event.
    if (newIds.has(site.id)) continue;
    events.push(
      toFeedEvent(
        "starts-soon",
        site,
        `starts-soon:${site.id}:${site.startDate}`,
      ),
    );
  }

  events.sort((left, right) => left.signature.localeCompare(right.signature));
  return events;
}

export const createNotificationFeed = (
  events: readonly NotificationFeedEvent[],
  generatedAt: string,
): NotificationFeed => ({ generatedAt, events: [...events] });

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
 * The subset of `events` a device with these preferences should be shown: a
 * kind it asked for, disruptive enough, and inside one of its areas.
 *
 * This is the whole reason the server can stay ignorant of anyone's location —
 * it runs on the device, after the push has arrived.
 */
export function selectNotificationEvents(
  events: readonly NotificationFeedEvent[],
  preferences: NotificationPreferences,
): NotificationFeedEvent[] {
  if (preferences.areas.length === 0) return [];
  return events.filter(
    (event) =>
      preferences.kinds.includes(event.kind) &&
      meetsSeverityThreshold(event.closure, preferences.minSeverity) &&
      findNotificationAreaForPoint(preferences.areas, event.point) !== undefined,
  );
}
