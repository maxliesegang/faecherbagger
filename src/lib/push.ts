import type { NotificationArea } from "../types/index.ts";

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

async function requestPushApi(path: string, init?: RequestInit) {
  if (!PUSH_API_URL) {
    throw new Error("Der Benachrichtigungsdienst ist noch nicht konfiguriert.");
  }
  const response = await fetch(`${PUSH_API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
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

export async function subscribeToPush(preferences?: NotificationArea) {
  if (!isPushSupported) {
    throw new Error("Web Push wird von diesem Browser nicht unterstützt.");
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await storeSubscription(existing, preferences);
    return existing;
  }

  const configResponse = await requestPushApi("/config");
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
  preferences?: NotificationArea,
) {
  await requestPushApi("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      ...subscription.toJSON(),
      ...(preferences ? { preferences } : {}),
    }),
  });
}

export async function updatePushPreferences(preferences: NotificationArea) {
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
    await requestPushApi("/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } finally {
    await subscription.unsubscribe();
  }
}
