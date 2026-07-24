import webpush from "web-push";
import { readFile } from "node:fs/promises";
import type { Changes, Meta } from "../src/types/index.ts";

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: number | null;
}

interface SubscriptionPage {
  subscriptions: StoredSubscription[];
  nextCursor: string | null;
}

const required = [
  "PUSH_API_URL",
  "PUSH_ADMIN_TOKEN",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "APP_URL",
] as const;

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing environment variable ${name}`);
}

const apiUrl = process.env.PUSH_API_URL!.replace(/\/+$/, "");
const adminToken = process.env.PUSH_ADMIN_TOKEN!;
const headers = {
  authorization: `Bearer ${adminToken}`,
  "content-type": "application/json",
};

const [changes, meta] = await Promise.all([
  readJson<Changes>("public/data/changes.json"),
  readJson<Meta>("public/data/meta.json"),
]);

const totalChanges =
  changes.added.length + changes.modified.length + changes.removed.length;
if (totalChanges === 0) {
  console.log("No Baustellen changes to broadcast.");
  process.exit(0);
}

const claimResponse = await fetch(`${apiUrl}/broadcasts/claim`, {
  method: "POST",
  headers,
  body: JSON.stringify({ fetchedAt: meta.fetchedAt }),
});
if (!claimResponse.ok) {
  throw new Error(`Could not claim broadcast: ${claimResponse.status}`);
}
const claim = (await claimResponse.json()) as { claimed?: boolean };
if (!claim.claimed) {
  console.log(`Broadcast for ${meta.fetchedAt} was already sent.`);
  process.exit(0);
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

const body = [
  changes.added.length ? `${changes.added.length} neu` : "",
  changes.modified.length ? `${changes.modified.length} geändert` : "",
  changes.removed.length ? `${changes.removed.length} beendet` : "",
]
  .filter(Boolean)
  .join(", ");
const payload = JSON.stringify({
  title: "Neue Baustelleninformationen",
  body,
  url: process.env.APP_URL,
  fetchedAt: meta.fetchedAt,
});

let cursor: string | null = "";
let sent = 0;
let removed = 0;
let failed = 0;

while (cursor !== null) {
  const page = await getPage(cursor);
  await mapWithConcurrency(page.subscriptions, 20, async (subscription) => {
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

console.log(
  `Push broadcast complete: ${sent} sent, ${removed} expired removed, ${failed} failed.`,
);
if (failed > 0 && sent === 0) process.exitCode = 1;

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function getPage(pageCursor: string): Promise<SubscriptionPage> {
  const query = new URLSearchParams({ limit: "500" });
  if (pageCursor) query.set("after", pageCursor);
  const response = await fetch(`${apiUrl}/subscriptions?${query}`, { headers });
  if (!response.ok) {
    throw new Error(`Could not read subscriptions: ${response.status}`);
  }
  return (await response.json()) as SubscriptionPage;
}

async function deleteSubscription(endpoint: string) {
  const response = await fetch(`${apiUrl}/subscriptions`, {
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
