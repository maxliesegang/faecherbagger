/**
 * Notification broadcast.
 *
 * Runs after a successful data refresh. Retains delivery opportunities for
 * pending events and sends every eligible subscriber a push without personal
 * content: a daily wake-up for Chromium, and for Safari and Firefox a
 * declarative push on the date each device planned for itself (see
 * `src/lib/push-delivery.ts` and `src/lib/push-schedule.ts`).
 *
 * It deliberately cannot tell who an event concerns: areas and preferences live
 * on the devices, and the service worker decides locally whether to show
 * anything at all. That is the whole point — this pipeline never sees a
 * location, so it cannot leak one.
 *
 * Run with: `npm run push:send`
 */
import webpush from "web-push";
import { readFile } from "node:fs/promises";
import type { NotificationFeed } from "../src/types/index.ts";
import { CONSTRUCTION_SITE_DATA_FILENAMES } from "../src/lib/construction-site-data-files.ts";
import { isWithinNotificationWindow } from "../src/lib/notification-message.ts";
import {
  createFallbackNextPushDate,
  createPlannedPushMessage,
  createWakeUpMessage,
  getPushDeliveryMode,
  isSubscriptionDue,
} from "../src/lib/push-delivery.ts";
import { getBerlinCalendarDate } from "../src/lib/construction-site-timeframe.ts";

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: number | null;
  lastNotifiedAt: number | null;
  /** Absent from Workers deployed before planned pushes existed. */
  nextPushOn?: string | null;
}

interface SubscriptionPage {
  subscriptions: StoredSubscription[];
  nextCursor: string | null;
}

const REQUIRED_ENVIRONMENT_VARIABLES = [
  "PUSH_API_URL",
  "APP_URL",
  "PUSH_ADMIN_TOKEN",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;

const SEND_CONCURRENCY = 20;

for (const name of REQUIRED_ENVIRONMENT_VARIABLES) {
  if (!process.env[name]) throw new Error(`Missing environment variable ${name}`);
}

const apiURL = process.env.PUSH_API_URL!.replace(/\/+$/, "");
const headers = {
  authorization: `Bearer ${process.env.PUSH_ADMIN_TOKEN!}`,
  "content-type": "application/json",
};

const now = new Date();
if (!isWithinNotificationWindow(now)) {
  // Events are only claimed once they are actually broadcast, so nothing is
  // lost: the next run inside the window picks them up.
  console.log(
    `Outside the notification window (${now.toISOString()}); deferring to the next run.`,
  );
  process.exit(0);
}

const feed = JSON.parse(
  await readFile(
    `public/data/${CONSTRUCTION_SITE_DATA_FILENAMES.notificationFeed}`,
    "utf8",
  ),
) as NotificationFeed;

if (feed.events.length === 0) {
  console.log("Nothing to announce for this run.");
  process.exit(0);
}

// Every eligible device gets another chance to fetch the retained feed. A global
// claim cannot represent successful delivery to each device; deduplication is
// local, where preferences and the notification history already live.
console.log(`${feed.events.length} retained events (generated ${feed.generatedAt}).`);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

/**
 * The wake-up says only "there is something new"; the receiving device turns
 * that into a notification, or into silence if none of the events fall inside
 * its areas. The planned push carries a generic fallback notification the
 * device replaces with its own summary. Neither names a place.
 */
const wakeUpPayload = JSON.stringify(createWakeUpMessage(feed.generatedAt));
const plannedPayload = JSON.stringify(
  createPlannedPushMessage(feed.generatedAt, process.env.APP_URL!),
);

let cursor: string | null = "";
let sent = 0;
let planned = 0;
let rateLimited = 0;
let removed = 0;
let failed = 0;
const notifiedEndpoints: string[] = [];

while (cursor !== null) {
  const page: SubscriptionPage = await getPage(cursor);
  await mapWithConcurrency(
    page.subscriptions,
    SEND_CONCURRENCY,
    async (subscription) => {
      const schedule = {
        ...subscription,
        nextPushOn: subscription.nextPushOn ?? null,
      };
      if (!isSubscriptionDue(schedule, now)) {
        rateLimited += 1;
        return;
      }
      const isPlanned =
        getPushDeliveryMode(subscription.endpoint) === "planned";
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          isPlanned ? plannedPayload : wakeUpPayload,
          { TTL: 60 * 60 * 12, urgency: "normal" },
        );
        sent += 1;
        if (isPlanned) planned += 1;
        notifiedEndpoints.push(subscription.endpoint);
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number(error.statusCode)
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await deleteSubscription(subscription.endpoint);
          removed += 1;
        } else {
          failed += 1;
          console.warn(
            `Push failed (${statusCode ?? "unknown"}).`,
          );
        }
      }
    },
  );
  cursor = page.nextCursor;
}

await markNotified(notifiedEndpoints);

console.log(
  `Broadcast complete: ${sent} sent (${planned} planned), ${rateLimited} not yet due, ` +
    `${removed} expired removed, ${failed} failed.`,
);
if (failed > 0 && sent === 0) process.exitCode = 1;

async function getPage(pageCursor: string): Promise<SubscriptionPage> {
  const query = new URLSearchParams({ limit: "500" });
  if (pageCursor) query.set("after", pageCursor);
  const response = await fetch(`${apiURL}/subscriptions?${query}`, { headers });
  if (!response.ok) {
    throw new Error(`Could not read subscriptions: ${response.status}`);
  }
  return (await response.json()) as SubscriptionPage;
}

async function markNotified(endpoints: readonly string[]): Promise<void> {
  if (endpoints.length === 0) return;
  const response = await fetch(`${apiURL}/subscriptions/notified`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      endpoints,
      today: getBerlinCalendarDate(now),
      fallbackNextPushOn: createFallbackNextPushDate(now),
    }),
  });
  if (!response.ok) {
    console.warn(`Could not record the send timestamps: ${response.status}`);
  }
}

async function deleteSubscription(endpoint: string) {
  const response = await fetch(`${apiURL}/subscriptions`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) {
    console.warn(`Could not remove expired subscription: ${response.status}`);
  }
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<void>,
) {
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (index < values.length) {
        const value = values[index];
        index += 1;
        await task(value);
      }
    },
  );
  await Promise.all(workers);
}
