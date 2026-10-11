/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import type { ConstructionSite, NotificationFeed } from "./types/index.ts";
import {
  CONSTRUCTION_SITE_CORE_DATA_FILENAMES,
  CONSTRUCTION_SITE_DATA_FILENAMES,
} from "./lib/construction-site-data-files.ts";
import { selectNotificationEvents } from "./lib/notification-events.ts";
import {
  createNotificationPayload,
  isWithinNotificationWindow,
  type NotificationPayload,
} from "./lib/notification-message.ts";
import {
  createInboxURL,
  createNothingNewPayload,
  getPushDeliveryMode,
  parsePushMessage,
  type PushMessage,
} from "./lib/push-delivery.ts";
import { planNextPushDate } from "./lib/push-schedule.ts";
import { getBerlinCalendarDate } from "./lib/construction-site-timeframe.ts";
import {
  loadNotificationPreferences,
  loadNotificationDeliveryState,
  loadPushScheduleState,
  updateNotificationDeliveryState,
  updatePushScheduleState,
} from "./lib/notification-preferences-store.ts";
import { isNotificationFeedEvent, selectUndeliveredNotificationEvents, recordNotificationDelivery } from "./lib/notification-delivery.ts";

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
    | { type?: "SCHEDULE_PUSH"; force?: boolean }
    | undefined;
  if (message?.type === "REFRESH_DATA") {
    // An app start: fresh data may move the next planned push.
    event.waitUntil(
      refreshConstructionSiteData()
        .catch(() => undefined)
        .then(() => reportNextPushDate())
        .catch(() => undefined),
    );
  }
  if (message?.type === "SCHEDULE_PUSH") {
    event.waitUntil(
      reportNextPushDate({
        force: "force" in message && message.force === true,
      }).catch(() => undefined),
    );
  }
});

async function loadCachedConstructionSites(): Promise<ConstructionSite[]> {
  const url = getDataURL(CONSTRUCTION_SITE_DATA_FILENAMES.constructionSites);
  const cache = await caches.open(DATA_CACHE_NAME);
  const response = (await cache.match(url)) ?? (await fetch(url));
  if (!response.ok) throw new Error("Construction sites unavailable");
  const sites: unknown = await response.json();
  if (!Array.isArray(sites)) throw new Error("Invalid construction sites");
  return sites as ConstructionSite[];
}

/**
 * Plans this device's next push and tells the server the date, nothing else.
 *
 * Only Safari and Firefox plan: in Chromium the daily wake-up may stay silent,
 * so there is nothing to plan for. Unchanged dates are not sent again.
 */
async function reportNextPushDate({ force = false } = {}) {
  if (!PUSH_API_URL) return;
  const subscription = await self.registration.pushManager.getSubscription();
  if (!subscription || getPushDeliveryMode(subscription.endpoint) !== "planned")
    return;

  const [preferences, schedule, constructionSites] = await Promise.all([
    loadNotificationPreferences(),
    loadPushScheduleState(),
    loadCachedConstructionSites(),
  ]);
  const nextPushOn = planNextPushDate({
    constructionSites,
    preferences,
    today: getBerlinCalendarDate(),
    lastPushOn: schedule.lastPushOn,
  });
  if (
    !force &&
    schedule.reportedNextPushOn === nextPushOn &&
    schedule.reportedEndpoint === subscription.endpoint
  )
    return;

  const response = await fetch(`${PUSH_API_URL}/subscriptions/next-push`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint, nextPushOn }),
  });
  if (!response.ok) return;
  await updatePushScheduleState({
    reportedNextPushOn: nextPushOn,
    reportedEndpoint: subscription.endpoint,
  });
}

self.addEventListener("sync", ((event: ExtendableEvent & { tag: string }) => {
  if (event.tag === REFRESH_TAG) {
    event.waitUntil(refreshConstructionSiteData());
  }
}) as EventListener);

/**
 * Chromium's periodic background sync: a truly local check, no push involved.
 *
 * Unlike a push, it carries no obligation to show anything, so it can stay
 * quiet when nothing matches. It runs only when the browser decides (installed
 * app, enough engagement), which is why the push remains the dependable path
 * and this is the bonus that sometimes gets there first. Receipts are shared,
 * so whichever comes second shows nothing new.
 */
self.addEventListener("periodicsync", ((event: ExtendableEvent & {
  tag: string;
}) => {
  if (event.tag !== REFRESH_TAG) return;
  event.waitUntil(
    (async () => {
      await refreshConstructionSiteData().catch(() => undefined);
      if (!(await isLocalNotificationAllowed())) return;
      await deliverSerially(() =>
        showMatchingConstructionSiteEvents(self.registration.scope, {
          isPlanned: false,
        }),
      );
    })().catch(() => undefined),
  );
}) as EventListener);

/**
 * Whether a check without a push may notify: permission granted, the visitor
 * has not switched notifications off (which drops the push subscription), and
 * within the same quiet hours the sender keeps.
 */
async function isLocalNotificationAllowed(): Promise<boolean> {
  if (Notification.permission !== "granted") return false;
  if (!isWithinNotificationWindow()) return false;
  return (await self.registration.pushManager.getSubscription()) !== null;
}

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
 *
 * A planned push (Safari, Firefox) must always show something: both drop the
 * subscription once pushes that show nothing add up. Without a match it says
 * so plainly.
 */
async function showMatchingConstructionSiteEvents(
  appURL: string,
  { isPlanned }: { isPlanned: boolean },
) {
  const [deliveryState, preferences, response] = await Promise.all([
    loadNotificationDeliveryState(),
    loadNotificationPreferences(),
    fetch(getDataURL(CONSTRUCTION_SITE_DATA_FILENAMES.notificationFeed), {
      cache: "no-store",
    }),
  ]);
  if (!response.ok) throw new Error("Notification feed unavailable");

  const feed = (await response.json()) as Partial<NotificationFeed>;
  if (!Array.isArray(feed.events) || !feed.events.every(isNotificationFeedEvent)) {
    throw new Error("Invalid notification feed");
  }
  const matching = selectUndeliveredNotificationEvents(
    selectNotificationEvents(feed.events, preferences),
    deliveryState,
  );
  const payload = createNotificationPayload(matching, preferences, appURL);
  if (!payload) {
    if (isPlanned) {
      await showConstructionSiteNotification(createNothingNewPayload(appURL));
    }
    return;
  }

  await showConstructionSiteNotification(payload);
  // Once a visible notification exists, a storage failure must not replace it
  // with the generic fetch-error fallback. A later wake-up can retry the receipt.
  const updated = await updateNotificationDeliveryState((current) =>
    recordNotificationDelivery(current, matching, new Date().toISOString()),
  ).catch(() => recordNotificationDelivery(deliveryState, matching, new Date().toISOString()));
  if ("setAppBadge" in self.navigator) {
    const unreadCount = updated.events.filter((event) => !updated.readSignatures.includes(event.signature)).length;
    await self.navigator.setAppBadge(unreadCount).catch(() => undefined);
  }
  await notifyClientsOfDataUpdate();
}

// Serialize event deliveries so overlapping wake-ups cannot show the same event.
let notificationDelivery: Promise<void> = Promise.resolve();

function deliverSerially(deliver: () => Promise<void>): Promise<void> {
  notificationDelivery = notificationDelivery
    .catch(() => undefined)
    .then(deliver);
  return notificationDelivery;
}

self.addEventListener("push", (event) => {
  let rawMessage: unknown;
  try {
    rawMessage = event.data?.json();
  } catch {
    rawMessage = undefined;
  }
  const message = parsePushMessage(rawMessage);
  // A mutable declarative push carries its proposed notification here.
  const isPlanned =
    message.kind === "planned" ||
    (event as PushEvent & { notification?: Notification | null })
      .notification != null;
  const appURL = self.registration.scope;

  event.waitUntil(
    (async () => {
      // The notification comes first: the platform only waits briefly, and on
      // Safari a late one counts as none. Refreshing the full data set can wait.
      await showForPushMessage(message, appURL, isPlanned);
      await refreshConstructionSiteData().catch(() => undefined);
      if (isPlanned) {
        // Plan the next one from the data just fetched. Should this fail, the
        // server's fallback brings the next push within a week.
        await updatePushScheduleState({ lastPushOn: getBerlinCalendarDate() })
          .then(() => reportNextPushDate())
          .catch(() => undefined);
      }
    })(),
  );
});

async function showForPushMessage(
  message: PushMessage,
  appURL: string,
  isPlanned: boolean,
) {
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
    await deliverSerially(() =>
      showMatchingConstructionSiteEvents(appURL, { isPlanned }),
    );
  } catch {
    // `userVisibleOnly` obliges us to show *something* when we cannot tell
    // whether anything matched; staying silent here would spend the
    // browser's budget and eventually earn its own generic notification.
    await showConstructionSiteNotification({
      title: "Neue Baustellendaten",
      body: "Öffnen Sie die App für Details.",
      url: createInboxURL(appURL),
      count: 0,
    });
  }
}

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
