import type { HomeArea } from "../types/index.ts";

const PUSH_API_URL = import.meta.env.VITE_PUSH_API_URL?.replace(/\/+$/, "");

export const isPushConfigured = Boolean(PUSH_API_URL);
export const isPushSupported =
  "serviceWorker" in navigator && "PushManager" in window;

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0),
  );
  return new Uint8Array(bytes.buffer);
}

async function requestPushAPI(path: string, init?: RequestInit) {
  if (!PUSH_API_URL) {
    throw new Error("Der Benachrichtigungsdienst ist noch nicht konfiguriert.");
  }
  // A rejected fetch carries the platform's untranslated "Failed to fetch",
  // and every caller shows what it catches to the visitor. This is the boundary
  // that knows the request was aimed at the notification service, so it is the
  // one that can name it.
  let response: Response;
  try {
    response = await fetch(`${PUSH_API_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("Der Benachrichtigungsdienst ist nicht erreichbar.");
  }
  if (!response.ok) {
    throw new Error(
      `Der Benachrichtigungsdienst antwortet mit Status ${response.status}.`,
    );
  }
  return response;
}

export async function getPushSubscription() {
  if (!isPushSupported) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(preferences?: HomeArea) {
  if (!isPushSupported) {
    throw new Error("Web Push wird von diesem Browser nicht unterstützt.");
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await storeSubscription(existing, preferences);
    return existing;
  }

  const configResponse = await requestPushAPI("/config");
  const config = (await configResponse.json()) as { vapidPublicKey?: string };
  if (!config.vapidPublicKey) {
    throw new Error("Der Benachrichtigungsdienst liefert keinen VAPID-Schlüssel.");
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
  });
  try {
    await storeSubscription(subscription, preferences);
    return subscription;
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
}

async function storeSubscription(
  subscription: PushSubscription,
  preferences?: HomeArea,
) {
  await requestPushAPI("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      ...subscription.toJSON(),
      ...(preferences ? { preferences } : {}),
    }),
  });
}

export async function updatePushPreferences(preferences: HomeArea) {
  const subscription = await getPushSubscription();
  if (!subscription) {
    throw new Error("Benachrichtigungen sind auf diesem Gerät nicht aktiviert.");
  }
  await storeSubscription(subscription, preferences);
}

export async function unsubscribeFromPush() {
  const subscription = await getPushSubscription();
  if (!subscription) return;
  try {
    // The `auth` key proves to the service that this caller owns the
    // subscription; knowing the endpoint URL alone must not be enough to
    // remove someone else's. If the request fails, the browser-side
    // unsubscribe below still runs and the now-dead endpoint is pruned by the
    // fan-out on its next attempt.
    await requestPushAPI("/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        auth: subscription.toJSON().keys?.auth,
      }),
    });
  } finally {
    await subscription.unsubscribe();
  }
}
