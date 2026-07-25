/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

const DATA_CACHE_NAME = "faecherbagger-data-v1";
const REFRESH_TAG = "refresh-baustellen";

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

function getDataUrl(filename: string) {
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
  const metadataUrl = getDataUrl("meta.json");
  const cachedMetadata = await cache.match(metadataUrl);
  const previousFetchedAt = cachedMetadata
    ? ((await cachedMetadata.clone().json()) as { fetchedAt?: string }).fetchedAt
    : undefined;

  const urls = [
    metadataUrl,
    getDataUrl("baustellen.json"),
    getDataUrl("changes.json"),
  ];
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

self.addEventListener("push", (event) => {
  let payload: {
    title?: string;
    body?: string;
    url?: string;
    count?: number;
  } = {};
  try {
    payload = event.data?.json() as typeof payload;
  } catch {
    payload.body = event.data?.text();
  }
  event.waitUntil(
    Promise.all([
      refreshConstructionSiteData().catch(() => undefined),
      typeof payload.count === "number" && "setAppBadge" in self.navigator
        ? self.navigator.setAppBadge(payload.count).catch(() => undefined)
        : Promise.resolve(),
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
    Promise.all([
      "clearAppBadge" in self.navigator
        ? self.navigator.clearAppBadge().catch(() => undefined)
        : Promise.resolve(),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then(async (windows) => {
          const existing = windows[0] as WindowClient | undefined;
          if (existing) {
            if ("navigate" in existing) await existing.navigate(targetUrl);
            await existing.focus();
            existing.postMessage({ type: "REFRESH_VIEW" });
            return;
          }
          await self.clients.openWindow(targetUrl);
        }),
    ]),
  );
});
