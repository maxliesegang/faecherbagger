/**
 * Notification broadcast.
 *
 * Runs after a successful data refresh. Claims this run's notification events
 * so each is announced exactly once, then sends every subscriber the same
 * contentless wake-up push.
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

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: number | null;
  lastNotifiedAt: number | null;
}

interface SubscriptionPage {
  subscriptions: StoredSubscription[];
  nextCursor: string | null;
}

const REQUIRED_ENVIRONMENT_VARIABLES = [
  "PUSH_API_URL",
  "PUSH_ADMIN_TOKEN",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;

/**
 * Safety valve behind the quiet-hours window.
 *
 * The window already yields at most one send per day given the twice-daily
 * pipeline; this stops a manual re-run or an extra workflow dispatch from
 * turning into a second wake-up on the same day.
 */
const MIN_HOURS_BETWEEN_PUSHES = 12;

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

// Claim first: a crash mid-broadcast must not re-announce everything on the
// next run. The cost is that a claimed event whose send fails is not retried,
// which is the right trade for notifications that age out anyway.
const claimed = await claimEvents(feed.events.map((event) => event.signature));
console.log(
  `${feed.events.length} events in the feed, ${claimed.length} newly claimed ` +
    `(generated ${feed.generatedAt}).`,
);
if (claimed.length === 0) process.exit(0);

const minimumLastNotifiedAt =
  Math.floor(now.getTime() / 1_000) - MIN_HOURS_BETWEEN_PUSHES * 60 * 60;

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

/**
 * The wake-up itself. It says only "there is something new"; the receiving
 * device turns that into a notification — or into silence, if none of the
 * events fall inside its areas.
 */
const wakeUpPayload = JSON.stringify({
  kind: "events",
  generatedAt: feed.generatedAt,
});

let cursor: string | null = "";
let sent = 0;
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
      if (
        subscription.lastNotifiedAt !== null &&
        subscription.lastNotifiedAt > minimumLastNotifiedAt
      ) {
        rateLimited += 1;
        return;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          wakeUpPayload,
          { TTL: 60 * 60 * 12, urgency: "normal" },
        );
        sent += 1;
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
            `Push failed (${statusCode ?? "unknown"}): ${subscription.endpoint.slice(0, 60)}…`,
          );
        }
      }
    },
  );
  cursor = page.nextCursor;
}

await markNotified(notifiedEndpoints);

console.log(
  `Broadcast complete: ${sent} woken, ${rateLimited} within the daily cap, ` +
    `${removed} expired removed, ${failed} failed.`,
);
if (failed > 0 && sent === 0) process.exitCode = 1;

async function claimEvents(signatures: readonly string[]): Promise<string[]> {
  const response = await fetch(`${apiURL}/events/claim`, {
    method: "POST",
    headers,
    body: JSON.stringify({ signatures }),
  });
  if (!response.ok) {
    throw new Error(`Could not claim notification events: ${response.status}`);
  }
  return ((await response.json()) as { claimed: string[] }).claimed;
}

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
    body: JSON.stringify({ endpoints }),
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
