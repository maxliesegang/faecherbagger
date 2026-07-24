/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

const DATA_CACHE = "faecherbagger-data-v1";
const SETTINGS_CACHE = "faecherbagger-settings-v1";
const REFRESH_TAG = "refresh-baustellen";
const NOTIFICATION_SETTING_URL = new URL(
  "__notification-setting",
  self.registration.scope,
).href;

type Changes = {
  added?: string[];
  modified?: string[];
  removed?: string[];
};

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
    cacheName: DATA_CACHE,
    networkTimeoutSeconds: 5,
  }),
);

function dataUrl(filename: string) {
  return new URL(`data/${filename}`, self.registration.scope).href;
}

async function notificationsEnabled() {
  const cache = await caches.open(SETTINGS_CACHE);
  const response = await cache.match(NOTIFICATION_SETTING_URL);
  return (await response?.text()) === "true";
}

async function setNotificationsEnabled(enabled: boolean) {
  const cache = await caches.open(SETTINGS_CACHE);
  await cache.put(
    NOTIFICATION_SETTING_URL,
    new Response(String(enabled), {
      headers: { "content-type": "text/plain" },
    }),
  );
}

function changeSummary(changes: Changes) {
  const added = changes.added?.length ?? 0;
  const modified = changes.modified?.length ?? 0;
  const removed = changes.removed?.length ?? 0;
  const parts = [
    added ? `${added} neu` : "",
    modified ? `${modified} geändert` : "",
    removed ? `${removed} beendet` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Die Baustellendaten wurden aktualisiert.";
}

async function notify(title: string, body: string) {
  if (!(await notificationsEnabled())) return;
  await self.registration.showNotification(title, {
    body,
    icon: new URL("icons/faecherbagger-192.png", self.registration.scope).href,
    badge: new URL("icons/faecherbagger-192.png", self.registration.scope).href,
    tag: "faecherbagger-update",
    data: { url: self.registration.scope },
  });
}

async function tellClientsDataChanged() {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  windows.forEach((client) => client.postMessage({ type: "DATA_UPDATED" }));
}

async function refreshData(showChangeNotification = true) {
  const cache = await caches.open(DATA_CACHE);
  const metaUrl = dataUrl("meta.json");
  const oldMeta = await cache.match(metaUrl);
  const oldFetchedAt = oldMeta
    ? ((await oldMeta.clone().json()) as { fetchedAt?: string }).fetchedAt
    : undefined;

  const urls = [
    metaUrl,
    dataUrl("baustellen.json"),
    dataUrl("changes.json"),
  ];
  const responses = await Promise.all(
    urls.map((url) => fetch(url, { cache: "no-store" })),
  );
  if (responses.some((response) => !response.ok)) {
    throw new Error("Baustellendaten konnten nicht aktualisiert werden.");
  }

  const newMeta = (await responses[0].clone().json()) as {
    fetchedAt?: string;
  };
  await Promise.all(
    responses.map((response, index) => cache.put(urls[index], response.clone())),
  );

  if (oldFetchedAt && newMeta.fetchedAt !== oldFetchedAt) {
    const changes = (await responses[2].clone().json()) as Changes;
    const tasks: Promise<unknown>[] = [tellClientsDataChanged()];
    if (showChangeNotification) {
      tasks.push(
        notify("Neue Baustelleninformationen", changeSummary(changes)),
      );
    }
    await Promise.all(tasks);
  }
}

self.addEventListener("message", (event) => {
  const message = event.data as
    | { type?: "SET_NOTIFICATIONS"; enabled?: boolean }
    | { type?: "REFRESH_DATA" }
    | undefined;
  if (message?.type === "SET_NOTIFICATIONS") {
    event.waitUntil(setNotificationsEnabled(Boolean(message.enabled)));
  }
  if (message?.type === "REFRESH_DATA") {
    event.waitUntil(refreshData().catch(() => undefined));
  }
});

self.addEventListener("sync", ((event: ExtendableEvent & { tag: string }) => {
  if (event.tag === REFRESH_TAG) {
    event.waitUntil(refreshData());
  }
}) as EventListener);

self.addEventListener("periodicsync", ((event: ExtendableEvent & {
  tag: string;
}) => {
  if (event.tag === REFRESH_TAG) {
    event.waitUntil(refreshData());
  }
}) as EventListener);

self.addEventListener("push", (event) => {
  let payload: { title?: string; body?: string; url?: string } = {};
  try {
    payload = event.data?.json() as typeof payload;
  } catch {
    payload.body = event.data?.text();
  }
  event.waitUntil(
    Promise.all([
      refreshData(false).catch(() => undefined),
      self.registration.showNotification(
        payload.title ?? "Fächerbagger",
        {
          body: payload.body ?? "Es gibt neue Baustelleninformationen.",
          icon: new URL(
            "icons/faecherbagger-192.png",
            self.registration.scope,
          ).href,
          badge: new URL(
            "icons/faecherbagger-192.png",
            self.registration.scope,
          ).href,
          tag: "faecherbagger-push",
          data: { url: payload.url ?? self.registration.scope },
        },
      ),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data as { url?: string } | undefined)?.url ??
    self.registration.scope;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const existing = windows[0] as WindowClient | undefined;
        if (existing) {
          await existing.focus();
          existing.postMessage({ type: "REFRESH_VIEW" });
          return;
        }
        await self.clients.openWindow(targetUrl);
      }),
  );
});
