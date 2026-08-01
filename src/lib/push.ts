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

/**
 * Registers this device with the notification service.
 *
 * Sends the push endpoint and nothing else — no areas, no radius, no
 * preferences. Those stay on the device; the service worker decides locally
 * which of a run's events are worth showing.
 */
export async function subscribeToPush() {
  if (!isPushSupported) {
    throw new Error("Web Push wird von diesem Browser nicht unterstützt.");
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await storeSubscription(existing);
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
    await storeSubscription(subscription);
    return subscription;
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
}

async function storeSubscription(subscription: PushSubscription) {
  await requestPushAPI("/subscriptions", {
    method: "POST",
    body: JSON.stringify(subscription.toJSON()),
  });
}

export async function unsubscribeFromPush() {
  const subscription = await getPushSubscription();
  if (!subscription) return;
  try {
    await requestPushAPI("/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } finally {
    await subscription.unsubscribe();
  }
}

/**
 * Whether this device is really registered with the notification service.
 *
 * The browser having a `PushSubscription` object is not the same as the server
 * being willing to send to it: a rotated endpoint, a database restore or a
 * failed registration all leave a device that believes it is subscribed and
 * never receives anything. This is the only honest source for "aktiv".
 */
export async function getServerSubscriptionState(): Promise<
  "unsupported" | "unconfigured" | "not-subscribed" | "registered"
> {
  if (!isPushSupported) return "unsupported";
  if (!isPushConfigured) return "unconfigured";
  const subscription = await getPushSubscription();
  if (!subscription) return "not-subscribed";

  const response = await requestPushAPI(
    `/subscriptions/status?endpoint=${encodeURIComponent(subscription.endpoint)}`,
  );
  const body = (await response.json()) as { registered?: boolean };
  return body.registered ? "registered" : "not-subscribed";
}

/**
 * Asks the server to send a real push to this device.
 *
 * A locally shown `showNotification` proves nothing — it works even when the
 * subscription was never stored. Only a round trip through the push service
 * tells the user their setup actually works.
 */
export async function sendTestNotification() {
  const subscription = await getPushSubscription();
  if (!subscription) {
    throw new Error("Benachrichtigungen sind auf diesem Gerät nicht aktiviert.");
  }
  await requestPushAPI("/notifications/test", {
    method: "POST",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
}
