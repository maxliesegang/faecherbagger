import webpush from "web-push";
import { readFile } from "node:fs/promises";
import type {
  ConstructionSite,
  ConstructionSiteAdditions,
  ConstructionSiteMetadata,
  HomeArea,
} from "../src/types/index.ts";
import { selectConstructionSitesInArea } from "../src/shared/home-area.ts";
import { toBerlinCalendarDate } from "../src/shared/construction-site-timing.ts";
import {
  selectNotifiableConstructionSites,
  toNotificationClosureLevel,
} from "../src/shared/notification-relevance.ts";
import { selectConstructionSitesToNotify } from "../src/pipeline/construction-site-additions.ts";
import { createPushNotificationPayload } from "../src/pipeline/push-notification.ts";

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: number | null;
  notificationLongitude: number | null;
  notificationLatitude: number | null;
  notificationRadiusMeters: number | null;
  /** `null` for a subscription stored before the setting existed. */
  notificationClosureLevel: string | null;
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
  "APP_URL",
] as const;

for (const name of REQUIRED_ENVIRONMENT_VARIABLES) {
  if (!process.env[name]) throw new Error(`Missing environment variable ${name}`);
}

const apiURL = process.env.PUSH_API_URL!.replace(/\/+$/, "");
const adminToken = process.env.PUSH_ADMIN_TOKEN!;
const headers = {
  authorization: `Bearer ${adminToken}`,
  "content-type": "application/json",
};

const [additions, metadata, constructionSites] = await Promise.all([
  readJSON<ConstructionSiteAdditions>("public/data/changes.json"),
  readJSON<ConstructionSiteMetadata>("public/data/meta.json"),
  readJSON<ConstructionSite[]>("public/data/baustellen.json"),
]);

// The service, not this repository, knows what has actually been delivered.
const broadcastCutoff = await readLastCompletedBroadcast();
const notifiableIds = new Set(
  selectConstructionSitesToNotify(additions, broadcastCutoff).map(
    (entry) => entry.id,
  ),
);
const addedSites = constructionSites.filter((site) =>
  notifiableIds.has(site.id),
);

/**
 * The day the dataset describes, which is what "kurzfristig" is measured
 * against here exactly as it is on the screen the notification opens.
 */
const today = toBerlinCalendarDate(metadata.fetchedAt);

/**
 * Candidates before the per-subscription closure level is applied.
 *
 * Being new to the pipeline is not on its own a reason to interrupt anyone:
 * `firstSeenAt` is when we learned about a record, and the source backfills
 * records whose work started months ago. Only the week around today survives —
 * the rest is history, and the app's own lists are where history belongs.
 */
const notifiableSites = selectNotifiableConstructionSites(
  addedSites,
  today,
  "all",
);

// Claimed even when there is nothing to send: completing an empty run is what
// moves the cutoff forward, and it is also how the very first run records a
// baseline instead of announcing the whole backlog to everyone.
const claimResponse = await fetch(`${apiURL}/broadcasts/claim`, {
  method: "POST",
  headers,
  body: JSON.stringify({ fetchedAt: metadata.fetchedAt }),
});
if (!claimResponse.ok) {
  throw new Error(`Could not claim broadcast: ${claimResponse.status}`);
}
const claim = (await claimResponse.json()) as { claimed?: boolean };
if (!claim.claimed) {
  console.log(
    `Broadcast for ${metadata.fetchedAt} was already sent or is still running.`,
  );
  process.exit(0);
}

if (notifiableSites.length === 0) {
  await completeBroadcast(metadata.fetchedAt);
  console.log(
    broadcastCutoff === null
      ? `No delivery history yet; recorded ${metadata.fetchedAt} as the baseline.`
      : `Nothing worth broadcasting since ${broadcastCutoff}: ${addedSites.length} ` +
          "new records, none of them within the short-notice window.",
  );
  process.exit(0);
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

let cursor: string | null = "";
let sent = 0;
let withoutMatches = 0;
let removed = 0;
let failed = 0;

// Any throw from here on leaves the broadcast claimed but uncompleted, so the
// next run may reclaim it and finish the fan-out instead of skipping the data
// run entirely.
while (cursor !== null) {
  const page = await getPage(cursor);
  await mapWithConcurrency(page.subscriptions, 20, async (subscription) => {
    const area = subscriptionArea(subscription);
    if (!area) {
      withoutMatches += 1;
      return;
    }
    // Area first, then the device's own threshold: the geometric test is the
    // cheaper of the two and usually the one that empties the list.
    const matchingSites = selectNotifiableConstructionSites(
      selectConstructionSitesInArea(notifiableSites, area),
      today,
      toNotificationClosureLevel(subscription.notificationClosureLevel),
    );
    if (matchingSites.length === 0) {
      withoutMatches += 1;
      return;
    }
    const payload = JSON.stringify(
      createPushNotificationPayload(
        matchingSites,
        process.env.APP_URL!,
        metadata.fetchedAt,
      ),
    );
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        { TTL: 60 * 60 * 12, urgency: "normal" },
      );
      sent += 1;
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
  });
  cursor = page.nextCursor;
}

// Every subscription was visited. Individual delivery failures are recorded
// above and must not reopen the broadcast: a retry would notify every device
// that already received it.
await completeBroadcast(metadata.fetchedAt);

console.log(
  `Push broadcast complete: ${addedSites.length} new construction sites, ` +
    `${notifiableSites.length} of them short notice, ${sent} sent, ` +
    `${withoutMatches} without an area or matches, ` +
    `${removed} expired removed, ${failed} failed.`,
);
if (failed > 0 && sent === 0) process.exitCode = 1;

async function readJSON<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readLastCompletedBroadcast(): Promise<string | null> {
  const response = await fetch(`${apiURL}/broadcasts/last`, { headers });
  if (!response.ok) {
    throw new Error(
      `Could not read the last completed broadcast: ${response.status}`,
    );
  }
  return ((await response.json()) as { fetchedAt: string | null }).fetchedAt;
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

async function completeBroadcast(fetchedAt: string) {
  const response = await fetch(`${apiURL}/broadcasts/complete`, {
    method: "POST",
    headers,
    body: JSON.stringify({ fetchedAt }),
  });
  if (!response.ok) {
    // The fan-out itself succeeded; failing here would only make the workflow
    // look broken. The claim stays open and a later run can reclaim it, which
    // the notification tag makes tolerable.
    console.warn(
      `Could not mark the broadcast as completed: ${response.status}. ` +
        "It may be re-sent by a later run.",
    );
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

function subscriptionArea(
  subscription: StoredSubscription,
): HomeArea | undefined {
  const longitude = subscription.notificationLongitude;
  const latitude = subscription.notificationLatitude;
  const radiusMeters = subscription.notificationRadiusMeters;
  if (
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof radiusMeters !== "number" ||
    !Number.isFinite(radiusMeters)
  ) {
    return undefined;
  }
  return {
    center: [longitude, latitude],
    radiusKm: radiusMeters / 1_000,
  };
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
