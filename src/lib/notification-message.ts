import type {
  NotificationFeedEvent,
  NotificationPreferences,
} from "../types/index.ts";
import {
  formatISODate,
  getClosureHeadline,
} from "./construction-site-labels.ts";
import { findNotificationAreaForPoint } from "./notification-events.ts";

/**
 * The wording of a notification, and the link it opens.
 *
 * Composed on the device, from the device's own areas — which is why the push
 * itself can be contentless and the server never needs to know who a given
 * event concerns.
 */

export interface NotificationPayload {
  title: string;
  body: string;
  /** Absolute URL; the notification click navigates here. */
  url: string;
  /** Drives the app badge. */
  count: number;
}

/**
 * Local hours during which a push may be delivered.
 *
 * The data pipeline runs at 06:00 and 18:00 local time. Waking people at six in
 * the morning to tell them about a road closure is how a service gets muted, so
 * the early run defers its events to the evening one — which also means at most
 * one push per day without any extra bookkeeping.
 */
export const NOTIFICATION_WINDOW_START_HOUR = 9;
export const NOTIFICATION_WINDOW_END_HOUR = 21;

const BERLIN_HOUR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  hour12: false,
});

/** The hour of day in Europe/Berlin, regardless of where the runner is. */
export const getBerlinHour = (instant: Date = new Date()): number =>
  Number.parseInt(BERLIN_HOUR.format(instant), 10);

export function isWithinNotificationWindow(instant: Date = new Date()): boolean {
  const hour = getBerlinHour(instant);
  return (
    hour >= NOTIFICATION_WINDOW_START_HOUR &&
    hour < NOTIFICATION_WINDOW_END_HOUR
  );
}

const KIND_PREFIX: Record<NotificationFeedEvent["kind"], string> = {
  new: "Neue Baustelle",
  "starts-soon": "Baustelle beginnt bald",
  changed: "Baustelle geändert",
};

/** One line describing a single event, used as a single-event body. */
function describeEvent(event: NotificationFeedEvent): string {
  if (event.kind === "changed") {
    return `${event.location} · jetzt: ${getClosureHeadline(event.closure)} · bis ${
      event.endDate ? formatISODate(event.endDate) : "offen"
    }`;
  }
  return `${event.location} · ab ${formatISODate(event.startDate)} · ${getClosureHeadline(event.closure)}`;
}

/**
 * Builds one notification for everything pending on this device.
 *
 * Always aggregated: two events in one run must not become two notifications.
 * A single event deep-links to that site; a batch opens the app scoped to what
 * is new, so the tap lands on the right records instead of the region overview.
 */
export function createNotificationPayload(
  events: readonly NotificationFeedEvent[],
  preferences: NotificationPreferences,
  appURL: string,
): NotificationPayload | null {
  if (events.length === 0) return null;
  const [firstEvent] = events;

  if (events.length === 1) {
    const url = new URL(appURL);
    url.searchParams.set("baustelle", firstEvent.siteId);
    return {
      title: `${KIND_PREFIX[firstEvent.kind]} in ${firstEvent.municipality}`,
      body: describeEvent(firstEvent),
      url: url.href,
      count: 1,
    };
  }

  const url = new URL(appURL);
  // Everything in a batch is either new, changed or about to start; the
  // "new or changed" scope is the closest existing view for all three.
  url.searchParams.set("neu", "1");
  url.searchParams.set("sortierung", "lastModified:descending");

  const areaLabels = [
    ...new Set(
      events
        .map(
          (event) =>
            findNotificationAreaForPoint(preferences.areas, event.point)?.label,
        )
        .filter((label): label is string => Boolean(label)),
    ),
  ];
  const scope =
    areaLabels.length === 1 ? ` bei ${areaLabels[0]}` : " in Ihren Gebieten";

  const fullClosureCount = events.filter(
    (event) => event.closure === "full",
  ).length;

  return {
    title: `${events.length} Meldungen${scope}`,
    body:
      fullClosureCount > 0
        ? `Darunter ${fullClosureCount}× Vollsperrung. Unter anderem: ${firstEvent.location}.`
        : `Unter anderem: ${firstEvent.location}, ${firstEvent.municipality}.`,
    url: url.href,
    count: events.length,
  };
}
