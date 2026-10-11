import type {
  ConstructionSite,
  ISODate,
  NotificationPreferences,
} from "../types/index.ts";
import { addCalendarDays } from "./construction-site-timeframe.ts";
import {
  createStartsSoonEvent,
  selectNotificationEvents,
  STARTS_SOON_LEAD_DAYS,
} from "./notification-events.ts";
import {
  DEFAULT_PUSH_RHYTHM_DAYS,
  isISODate,
  isPushRhythmDays,
} from "./push-delivery.ts";

/**
 * When a Safari or Firefox device wants its next push, decided on the device.
 *
 * These browsers must show every push, so the device is only woken when there
 * is a reason: on the day one of its start reminders becomes due, or when the
 * rhythm runs out. Whatever else is new rides along with that push.
 *
 * The device reports one date and nothing else, never the site or the reason.
 * The same date may be a reminder or just the rhythm's turn, and several sites
 * across the region usually start on any given day.
 */

export interface PushScheduleState {
  /** Berlin date of the last planned push this device received. */
  lastPushOn?: ISODate;
  /** What was last reported, so an unchanged date is not sent again. */
  reportedNextPushOn?: ISODate;
  reportedEndpoint?: string;
}

export function coercePushScheduleState(value: unknown): PushScheduleState {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  return {
    ...(isISODate(candidate.lastPushOn)
      ? { lastPushOn: candidate.lastPushOn }
      : {}),
    ...(isISODate(candidate.reportedNextPushOn)
      ? { reportedNextPushOn: candidate.reportedNextPushOn }
      : {}),
    ...(typeof candidate.reportedEndpoint === "string"
      ? { reportedEndpoint: candidate.reportedEndpoint }
      : {}),
  };
}

const earlierOf = (left: ISODate, right: ISODate): ISODate =>
  left < right ? left : right;

const laterOf = (left: ISODate, right: ISODate): ISODate =>
  left > right ? left : right;

/**
 * The next date this device should be woken on.
 *
 * Reminders are foreseen with the pipeline's own event and the device's own
 * matching, evaluated as of the day they fall due, so a reported date is the
 * day the event actually appears in the feed. Only start reminders can be
 * planned; new sites and changes cannot, and wait for the next push.
 */
export function planNextPushDate({
  constructionSites,
  preferences,
  today,
  lastPushOn,
}: {
  constructionSites: readonly ConstructionSite[];
  preferences: NotificationPreferences;
  today: ISODate;
  lastPushOn?: ISODate;
}): ISODate {
  const rhythmDays = isPushRhythmDays(preferences.pushRhythmDays)
    ? preferences.pushRhythmDays
    : DEFAULT_PUSH_RHYTHM_DAYS;
  // Today's evening push is still to come unless it has already arrived.
  const earliest =
    lastPushOn !== undefined && lastPushOn >= today
      ? addCalendarDays(today, 1)
      : today;
  let next = laterOf(
    addCalendarDays(lastPushOn ?? today, rhythmDays),
    earliest,
  );

  for (const site of constructionSites) {
    if (site.startDate <= earliest) continue;
    for (const leadDays of STARTS_SOON_LEAD_DAYS) {
      const dueOn = addCalendarDays(site.startDate, -leadDays);
      if (dueOn < earliest || dueOn >= next) continue;
      const reminder = createStartsSoonEvent(site, leadDays, dueOn);
      if (selectNotificationEvents([reminder], preferences, dueOn).length > 0) {
        next = earlierOf(next, dueOn);
      }
    }
  }
  return next;
}
