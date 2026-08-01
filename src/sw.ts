/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import type { NotificationFeed } from "./types/index.ts";
import {
  CONSTRUCTION_SITE_CORE_DATA_FILENAMES,
  CONSTRUCTION_SITE_DATA_FILENAMES,
} from "./lib/construction-site-data-files.ts";
import { selectNotificationEvents } from "./lib/notification-events.ts";
import {
  createNotificationPayload,
  type NotificationPayload,
} from "./lib/notification-message.ts";
import { loadNotificationPreferences } from "./lib/notification-preferences-store.ts";

declare let self: ServiceWorkerGlobalScope;

const DATA_CACHE_NAME = "faecherbagger-data-v1";
const REFRESH_TAG = "refresh-baustellen";
const PUSH_API_URL = import.meta.env.VITE_PUSH_API_URL?.replace(/\/+$/, "");

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();
self.skipWaiting();

registerRoute(
  ({ url }) =>
    url.origin === self.location.origin &&
    url.pathname.includes("/data/") &&
    url.pathname.endsWith(".json"),
  new NetworkFirst({
    cacheName: DATA_CACHE_NAME,
    networkTimeoutSeconds: 5,
  }),
);

function getDataURL(filename: string) {
  return new URL(`data/${filename}`, self.registration.scope).href;
}

async function notifyClientsOfDataUpdate() {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  windows.forEach((client) => client.postMessage({ type: "DATA_UPDATED" }));
}

async function refreshConstructionSiteData() {
  const cache = await caches.open(DATA_CACHE_NAME);
  const metadataURL = getDataURL(CONSTRUCTION_SITE_DATA_FILENAMES.metadata);
  const cachedMetadata = await cache.match(metadataURL);
  const previousFetchedAt = cachedMetadata
    ? ((await cachedMetadata.clone().json()) as { fetchedAt?: string }).fetchedAt
    : undefined;

  const urls = CONSTRUCTION_SITE_CORE_DATA_FILENAMES.map(getDataURL);
  const responses = await Promise.all(
    urls.map((url) => fetch(url, { cache: "no-store" })),
  );
  if (responses.some((response) => !response.ok)) {
    throw new Error("Baustellendaten konnten nicht aktualisiert werden.");
  }

  const updatedMetadata = (await responses[0].clone().json()) as {
    fetchedAt?: string;
  };
  await Promise.all(
    responses.map((response, index) => cache.put(urls[index], response.clone())),
  );

  if (
    previousFetchedAt &&
    updatedMetadata.fetchedAt !== previousFetchedAt
  ) {
    await notifyClientsOfDataUpdate();
  }
}

self.addEventListener("message", (event) => {
  const message = event.data as
    | { type?: "REFRESH_DATA" }
    | undefined;
  if (message?.type === "REFRESH_DATA") {
    event.waitUntil(refreshConstructionSiteData().catch(() => undefined));
  }
});

self.addEventListener("sync", ((event: ExtendableEvent & { tag: string }) => {
  if (event.tag === REFRESH_TAG) {
    event.waitUntil(refreshConstructionSiteData());
  }
}) as EventListener);

self.addEventListener("periodicsync", ((event: ExtendableEvent & {
  tag: string;
}) => {
  if (event.tag === REFRESH_TAG) {
    event.waitUntil(refreshConstructionSiteData());
  }
}) as EventListener);

const NOTIFICATION_ICON = () =>
  new URL("icons/faecherbagger-192.png", self.registration.scope).href;

function showConstructionSiteNotification(payload: NotificationPayload) {
  return self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: NOTIFICATION_ICON(),
    badge: NOTIFICATION_ICON(),
    tag: "faecherbagger-push",
    data: { url: payload.url },
  });
}

/**
 * Decides on the device which of this run's events are worth showing.
 *
 * The push that triggers this carries no personal content — only "there is
 * something new". The areas, the radius and the chosen kinds never leave the
 * browser, so the notification service cannot know where anyone lives. The
 * cost is this fetch: a small events file, not the full record set.
 */
async function showMatchingConstructionSiteEvents(appURL: string) {
  const [preferences, response] = await Promise.all([
    loadNotificationPreferences(),
    fetch(getDataURL(CONSTRUCTION_SITE_DATA_FILENAMES.notificationFeed), {
      cache: "no-store",
    }),
  ]);
  if (!response.ok) throw new Error("Notification feed unavailable");

  const feed = (await response.json()) as NotificationFeed;
  const matching = selectNotificationEvents(feed.events, preferences);
  const payload = createNotificationPayload(matching, preferences, appURL);
  if (!payload) return;

  if ("setAppBadge" in self.navigator) {
    await self.navigator.setAppBadge(payload.count).catch(() => undefined);
  }
  await showConstructionSiteNotification(payload);
}

interface PushMessage {
  /** `"test"` is the user-triggered delivery check and always shows. */
  kind?: "events" | "test";
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  let message: PushMessage = {};
  try {
    message = (event.data?.json() ?? {}) as PushMessage;
  } catch {
    message = {};
  }
  const appURL = self.registration.scope;

  event.waitUntil(
    (async () => {
      await refreshConstructionSiteData().catch(() => undefined);

      if (message.kind === "test") {
        await showConstructionSiteNotification({
          title: message.title ?? "Zustellung funktioniert",
          body: message.body ?? "Benachrichtigungen kommen auf diesem Gerät an.",
          url: message.url ?? appURL,
          count: 0,
        });
        return;
      }

      try {
        await showMatchingConstructionSiteEvents(appURL);
      } catch {
        // `userVisibleOnly` obliges us to show *something* when we cannot tell
        // whether anything matched; staying silent here would spend the
        // browser's budget and eventually earn its own generic notification.
        await showConstructionSiteNotification({
          title: "Neue Baustellendaten",
          body: "Öffnen Sie die App, um zu sehen, was sich geändert hat.",
          url: appURL,
          count: 0,
        });
      }
    })(),
  );
});

/**
 * Re-registers the device when the browser rotates its push subscription.
 *
 * Browsers replace a subscription on their own schedule. Without this handler
 * the stored endpoint goes stale, the next send gets a 410, the server deletes
 * the row — and the user keeps seeing "Benachrichtigungen sind aktiv" while
 * nothing will ever arrive again. There is no user-visible failure mode to
 * notice, which is why it has to be handled here rather than on next launch.
 */
self.addEventListener("pushsubscriptionchange", ((
  event: ExtendableEvent & {
    oldSubscription?: PushSubscription | null;
    newSubscription?: PushSubscription | null;
  },
) => {
  if (!PUSH_API_URL) return;
  event.waitUntil(
    (async () => {
      const oldEndpoint = event.oldSubscription?.endpoint;
      // Some browsers hand over the replacement; the rest expect a re-subscribe
      // with the same options.
      const subscription =
        event.newSubscription ??
        (await self.registration.pushManager.subscribe(
          (await self.registration.pushManager.getSubscription())?.options ??
            (event.oldSubscription?.options as PushSubscriptionOptionsInit),
        ));
      if (!subscription) return;

      await fetch(`${PUSH_API_URL}/subscriptions/rotate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          oldEndpoint,
          subscription: subscription.toJSON(),
        }),
      });
    })().catch(() => undefined),
  );
}) as EventListener);

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetURL =
    (event.notification.data as { url?: string } | undefined)?.url ??
    self.registration.scope;
  event.waitUntil(
    Promise.all([
      "clearAppBadge" in self.navigator
        ? self.navigator.clearAppBadge().catch(() => undefined)
        : Promise.resolve(),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then(async (windows) => {
          const existing = windows[0] as WindowClient | undefined;
          if (existing) {
            if ("navigate" in existing) await existing.navigate(targetURL);
            await existing.focus();
            existing.postMessage({ type: "REFRESH_VIEW" });
            return;
          }
          await self.clients.openWindow(targetURL);
        }),
    ]),
  );
});
