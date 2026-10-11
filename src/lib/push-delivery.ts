import type { ISODate } from "../types/index.ts";
import type { NotificationPayload } from "./notification-message.ts";
import {
  addCalendarDays,
  getBerlinCalendarDate,
} from "./construction-site-timeframe.ts";

/**
 * How a push reaches a device, and what the device must do with it.
 *
 * Every browser demands a visible notification per push (`userVisibleOnly`),
 * but they enforce it differently. Chromium and Firefox tolerate the odd
 * silent wake-up within an engagement budget, so there a push can wake the
 * device, which then stays quiet when nothing matches its areas. Safari and
 * Firefox drop the subscription once silent pushes add up, so those devices
 * are only woken when they asked to be: on the next date the device itself
 * planned (see `push-schedule.ts`), and always show something.
 *
 * The mode is read off the endpoint host, which the server has anyway. It says
 * which push service a device uses, not where its owner lives.
 *
 * Shared by the sender, the service worker and the app, so all three agree on
 * the wire format and the schedule.
 */

export type PushDeliveryMode = "wake-up" | "planned";

/**
 * How often a planning device hears from the service at the latest, in days.
 *
 * A device setting, never sent to the server: the device folds it into the one
 * date it reports.
 */
export const PUSH_RHYTHM_DAYS = [1, 3, 7] as const;
export type PushRhythmDays = (typeof PUSH_RHYTHM_DAYS)[number];
export const DEFAULT_PUSH_RHYTHM_DAYS: PushRhythmDays = 7;
/** Also the server's fallback when a device has not reported a date. */
export const MAX_PUSH_RHYTHM_DAYS: PushRhythmDays = 7;

export const isPushRhythmDays = (value: unknown): value is PushRhythmDays =>
  PUSH_RHYTHM_DAYS.includes(value as PushRhythmDays);

export const PUSH_RHYTHM_LABELS: Record<PushRhythmDays, string> = {
  1: "Täglich",
  3: "Alle 3 Tage",
  7: "Wöchentlich",
};

/**
 * Push services whose browsers drop a subscription over silent pushes: Apple's
 * (Safari on iOS, iPadOS and macOS) and Mozilla's (Firefox, also on Android).
 * Chromium only shows its own generic notice, so it keeps the daily wake-up.
 */
const PLANNED_PUSH_HOSTS = ["push.apple.com", "push.services.mozilla.com"];

export function getPushDeliveryMode(endpoint: string): PushDeliveryMode {
  try {
    const { hostname } = new URL(endpoint);
    return PLANNED_PUSH_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    )
      ? "planned"
      : "wake-up";
  } catch {
    return "wake-up";
  }
}

/**
 * Safety valve for every push.
 *
 * The quiet-hours window already yields at most one send per day given the
 * twice-daily pipeline; this stops a manual re-run from becoming a second
 * push on the same day.
 */
const MIN_HOURS_BETWEEN_PUSHES = 12;

/**
 * Slack for the fallback: the evening run does not start at the same minute
 * every day, and a push that misses its slot by minutes must not slip a day.
 */
const SCHEDULE_SLACK_HOURS = 12;

export const isISODate = (value: unknown): value is ISODate => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const instant = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === value
  );
};

export interface PushScheduleSubscription {
  endpoint: string;
  /** Unix seconds. */
  lastNotifiedAt: number | null;
  /** The date the device asked to be woken on; planning devices only. */
  nextPushOn: string | null;
}

export function isSubscriptionDue(
  subscription: PushScheduleSubscription,
  now: Date,
): boolean {
  const elapsedHours =
    subscription.lastNotifiedAt === null
      ? Number.POSITIVE_INFINITY
      : (now.getTime() / 1_000 - subscription.lastNotifiedAt) / 3_600;
  if (elapsedHours < MIN_HOURS_BETWEEN_PUSHES) return false;
  if (getPushDeliveryMode(subscription.endpoint) === "wake-up") return true;
  if (isISODate(subscription.nextPushOn)) {
    return subscription.nextPushOn <= getBerlinCalendarDate(now);
  }
  // Never reported a date: fall back to the slowest rhythm.
  return elapsedHours >= MAX_PUSH_RHYTHM_DAYS * 24 - SCHEDULE_SLACK_HOURS;
}

/**
 * Written by the server after each push until the device reports its own
 * date, so a device whose report fails still hears back within the rhythm.
 */
export const createFallbackNextPushDate = (now: Date): ISODate =>
  addCalendarDays(getBerlinCalendarDate(now), MAX_PUSH_RHYTHM_DAYS);

/** What the sender puts into a push, and what the service worker reads back. */
export interface PushMessage {
  /** `"test"` is the user-triggered delivery check and always shows. */
  kind?: "events" | "planned" | "test";
  generatedAt?: string;
  title?: string;
  body?: string;
  url?: string;
}

/** Opens the app on the visitor's own messages. */
export function createInboxURL(appURL: string): string {
  const url = new URL(appURL);
  url.searchParams.set("bereich", "fuer-mich");
  url.hash = "meldungen";
  return url.href;
}

export function createWakeUpMessage(generatedAt: string): PushMessage {
  return { kind: "events", generatedAt };
}

/** Shown by the platform when the service worker cannot run in time. */
export const PLANNED_PUSH_FALLBACK_TITLE = "Neue Baustellendaten";
export const PLANNED_PUSH_FALLBACK_BODY =
  "Öffnen Sie die App, um Meldungen für Ihre Orte zu sehen.";

/**
 * A planned push, as a Declarative Web Push message (WebKit since iOS 18.4, W3C Push API draft).
 *
 * The `notification` member is a fallback the platform shows by itself if the
 * service worker does not replace it in time. That covers the case that
 * revokes a legacy subscription. `mutable` lets the service worker run and
 * replace it with what matches this device's areas. Firefox and older Safari
 * versions ignore the declarative members and fire a plain `push` event with
 * the same JSON, which the service worker handles identically.
 */
export function createPlannedPushMessage(generatedAt: string, appURL: string) {
  return {
    web_push: 8030,
    notification: {
      title: PLANNED_PUSH_FALLBACK_TITLE,
      body: PLANNED_PUSH_FALLBACK_BODY,
      navigate: createInboxURL(appURL),
      lang: "de-DE",
    },
    mutable: true,
    kind: "planned",
    generatedAt,
  } satisfies PushMessage & Record<string, unknown>;
}

/** Narrows a push payload; anything unreadable becomes an empty message. */
export function parsePushMessage(value: unknown): PushMessage {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  const optionalString = (key: string) =>
    typeof candidate[key] === "string" ? (candidate[key] as string) : undefined;
  const kind =
    candidate.kind === "events" ||
    candidate.kind === "planned" ||
    candidate.kind === "test"
      ? candidate.kind
      : // A declarative message without our own marker is still a planned one.
        candidate.web_push === 8030
        ? "planned"
        : undefined;
  return {
    kind,
    generatedAt: optionalString("generatedAt"),
    title: optionalString("title"),
    body: optionalString("body"),
    url: optionalString("url"),
  };
}

/**
 * A planned push with nothing to report, usually the rhythm's turn. It has to
 * show something on Safari and Firefox, so it says that plainly.
 */
export function createNothingNewPayload(appURL: string): NotificationPayload {
  return {
    title: "Keine neuen Meldungen",
    body: "Für Ihre Orte gibt es seit der letzten Nachricht nichts Neues.",
    url: appURL,
    count: 0,
  };
}
