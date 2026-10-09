import type { NotificationFeedEvent } from "../types/index.ts";
import { isLngLat } from "./notification-preferences.ts";

const isCalendarDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const instant = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === value
  );
};

export interface NotificationDeliveryState {
  delivered: Record<string, string>;
  events: NotificationFeedEvent[];
  readSignatures: string[];
}

export const createNotificationDeliveryState =
  (): NotificationDeliveryState => ({
    delivered: {},
    events: [],
    readSignatures: [],
  });

/** Narrow persisted records, including records written by an older app version. */
export function coerceNotificationDeliveryState(
  value: unknown,
): NotificationDeliveryState {
  if (!value || typeof value !== "object")
    return createNotificationDeliveryState();
  const candidate = value as Partial<NotificationDeliveryState>;
  const delivered: Record<string, string> = {};
  if (candidate.delivered && typeof candidate.delivered === "object") {
    for (const [signature, timestamp] of Object.entries(candidate.delivered)) {
      if (
        typeof timestamp === "string" &&
        Number.isFinite(Date.parse(timestamp))
      ) {
        delivered[signature] = timestamp;
      }
    }
  }
  const events = Array.isArray(candidate.events)
    ? candidate.events.filter(isNotificationFeedEvent)
    : [];
  const readSignatures = Array.isArray(candidate.readSignatures)
    ? candidate.readSignatures.filter(
        (signature): signature is string => typeof signature === "string",
      )
    : [];
  return { delivered, events, readSignatures };
}

export function isNotificationFeedEvent(
  value: unknown,
): value is NotificationFeedEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<NotificationFeedEvent>;
  return (
    (event.kind === "new" ||
      event.kind === "starts-soon" ||
      event.kind === "changed") &&
    typeof event.signature === "string" &&
    typeof event.siteId === "string" &&
    isLngLat(event.point) &&
    ["none", "obstruction", "one-direction", "full", "unknown"].includes(
      event.closure ?? "",
    ) &&
    isCalendarDate(event.startDate) &&
    (event.endDate === null || isCalendarDate(event.endDate)) &&
    typeof event.municipality === "string" &&
    typeof event.location === "string" &&
    (event.announcedOn === undefined || isCalendarDate(event.announcedOn)) &&
    (event.reminderLeadDays === undefined ||
      event.reminderLeadDays === 1 ||
      event.reminderLeadDays === 14) &&
    (event.previousStartDate === undefined ||
      isCalendarDate(event.previousStartDate)) &&
    (event.previousClosure === undefined ||
      ["none", "obstruction", "one-direction", "full", "unknown"].includes(
        event.previousClosure,
      ))
  );
}

export function selectUndeliveredNotificationEvents(
  events: readonly NotificationFeedEvent[],
  state: NotificationDeliveryState,
): NotificationFeedEvent[] {
  return events.filter(
    (event) => !Object.hasOwn(state.delivered, event.signature),
  );
}

/** Show one useful hint per construction site in a delivery, but acknowledge all events. */
export function summarizeNotificationEvents(
  events: readonly NotificationFeedEvent[],
): NotificationFeedEvent[] {
  const priority = { changed: 0, new: 1, "starts-soon": 2 };
  const eventsByConstructionSite = new Map<string, NotificationFeedEvent>();
  const ordered = [...events].sort(
    (left, right) =>
      priority[left.kind] - priority[right.kind] ||
      (left.reminderLeadDays ?? 14) - (right.reminderLeadDays ?? 14),
  );
  for (const event of ordered) {
    if (!eventsByConstructionSite.has(event.siteId))
      eventsByConstructionSite.set(event.siteId, event);
  }
  return [...eventsByConstructionSite.values()];
}

/** Retain receipts longer than the feed, and a bounded, readable local inbox. */
export function recordNotificationDelivery(
  state: NotificationDeliveryState,
  events: readonly NotificationFeedEvent[],
  deliveredAt: string,
): NotificationDeliveryState {
  const earliest = Date.parse(deliveredAt) - 30 * 24 * 60 * 60 * 1000;
  const delivered = Object.fromEntries(
    Object.entries(state.delivered).filter(
      ([, timestamp]) => Date.parse(timestamp) >= earliest,
    ),
  );
  for (const event of events) delivered[event.signature] = deliveredAt;
  const eventsBySignature = new Map(
    [...summarizeNotificationEvents(events), ...state.events]
      .filter((event) => Object.hasOwn(delivered, event.signature))
      .map((event) => [event.signature, event]),
  );
  const retainedEvents = [...eventsBySignature.values()].slice(0, 500);
  return {
    delivered,
    events: retainedEvents,
    readSignatures: state.readSignatures.filter((signature) =>
      retainedEvents.some((event) => event.signature === signature),
    ),
  };
}
