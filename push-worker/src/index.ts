import {
  claimNotificationEvents,
  deleteSubscription,
  markSubscriptionsNotified,
  readSubscription,
  readSubscriptionPage,
  rotateSubscription,
  saveSubscription,
} from "./subscription-store.ts";
import { sendWebPush } from "./web-push.ts";

interface PushSubscriptionRequest {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_ENDPOINT_LENGTH = 4096;
const MAX_KEY_LENGTH = 512;
const MAX_CLAIMED_EVENTS = 2_000;
const DEFAULT_SUBSCRIPTION_PAGE_SIZE = 250;
const MAX_SUBSCRIPTION_PAGE_SIZE = 500;
/** One user-triggered test push per device per minute. */
const TEST_NOTIFICATION_COOLDOWN_SECONDS = 60;

function createJSONResponse(
  body: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function getAllowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    allowed.includes(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return origin;
  }
  return null;
}

function createCorsHeaders(origin: string | null): HeadersInit {
  return origin
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-max-age": "86400",
        vary: "Origin",
      }
    : {};
}

/** Rejects browser requests from origins outside the configured allowlist. */
function rejectDisallowedOrigin(
  request: Request,
  origin: string | null,
): Response | null {
  return request.headers.has("origin") && !origin
    ? createJSONResponse({ error: "Origin not allowed" }, 403)
    : null;
}

async function hasAdminAccess(request: Request, env: Env) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || !env.ADMIN_TOKEN) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest(
      "SHA-256",
      encoder.encode(authorization.slice("Bearer ".length)),
    ),
    crypto.subtle.digest("SHA-256", encoder.encode(env.ADMIN_TOKEN)),
  ]);
  return crypto.subtle.timingSafeEqual(
    new Uint8Array(providedHash),
    new Uint8Array(expectedHash),
  );
}

const isValidEndpoint = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_ENDPOINT_LENGTH &&
  value.startsWith("https://");

interface ParsedPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: number | null;
}

function parsePushSubscription(
  value: PushSubscriptionRequest | null | undefined,
): ParsedPushSubscription | null {
  if (!value || !isValidEndpoint(value.endpoint)) return null;
  const p256dh = value.keys?.p256dh;
  const auth = value.keys?.auth;
  if (
    typeof p256dh !== "string" ||
    p256dh.length === 0 ||
    p256dh.length > MAX_KEY_LENGTH ||
    typeof auth !== "string" ||
    auth.length === 0 ||
    auth.length > MAX_KEY_LENGTH
  ) {
    return null;
  }
  return {
    endpoint: value.endpoint,
    p256dh,
    auth,
    expirationTime: value.expirationTime ?? null,
  };
}

async function parseJSONBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function parseSubscriptionPageSize(value: string | null): number {
  if (value === null) return DEFAULT_SUBSCRIPTION_PAGE_SIZE;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SUBSCRIPTION_PAGE_SIZE;
  return Math.min(Math.max(parsed, 1), MAX_SUBSCRIPTION_PAGE_SIZE);
}

function getVapidKeys(env: Env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return null;
  }
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };
}

async function handleSubscriptionRequest(
  request: Request,
  env: Env,
  origin: string | null,
) {
  if (request.method === "POST") {
    const originError = rejectDisallowedOrigin(request, origin);
    if (originError) return originError;
    const body = await parseJSONBody<PushSubscriptionRequest>(request);
    const subscription = parsePushSubscription(body);
    if (!subscription) {
      return createJSONResponse(
        { error: "Invalid push subscription" },
        400,
        createCorsHeaders(origin),
      );
    }
    // Deliberately stores no preferences: the device decides what to show.
    await saveSubscription(env.DB, subscription);
    return createJSONResponse({ ok: true }, 201, createCorsHeaders(origin));
  }

  if (request.method === "DELETE") {
    const body = await parseJSONBody<{ endpoint?: string }>(request);
    if (!isValidEndpoint(body?.endpoint)) {
      return createJSONResponse(
        { error: "Invalid request" },
        400,
        createCorsHeaders(origin),
      );
    }
    const originError = rejectDisallowedOrigin(request, origin);
    if (originError && !(await hasAdminAccess(request, env))) return originError;
    await deleteSubscription(env.DB, body.endpoint);
    return createJSONResponse({ ok: true }, 200, createCorsHeaders(origin));
  }

  if (request.method === "GET") {
    if (!(await hasAdminAccess(request, env))) {
      return createJSONResponse({ error: "Unauthorized" }, 401);
    }
    const url = new URL(request.url);
    const page = await readSubscriptionPage(env.DB, {
      limit: parseSubscriptionPageSize(url.searchParams.get("limit")),
      after: url.searchParams.get("after") ?? "",
    });
    return createJSONResponse(page);
  }

  return createJSONResponse(
    { error: "Method not allowed" },
    405,
    createCorsHeaders(origin),
  );
}

/**
 * Lets a device ask whether the server still knows it.
 *
 * The endpoint itself is the capability here — anyone holding it could already
 * push to the device — so no further authentication is required, and none is
 * possible: the service worker has no credentials to present.
 */
async function handleSubscriptionStatusRequest(
  request: Request,
  env: Env,
  origin: string | null,
) {
  if (request.method !== "GET") {
    return createJSONResponse({ error: "Method not allowed" }, 405);
  }
  const originError = rejectDisallowedOrigin(request, origin);
  if (originError) return originError;
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!isValidEndpoint(endpoint)) {
    return createJSONResponse(
      { error: "Invalid endpoint" },
      400,
      createCorsHeaders(origin),
    );
  }
  const subscription = await readSubscription(env.DB, endpoint);
  return createJSONResponse(
    { registered: subscription !== null },
    200,
    createCorsHeaders(origin),
  );
}

/**
 * Re-registers a device whose browser replaced its push subscription.
 *
 * Called from the service worker's `pushsubscriptionchange` handler. Without
 * it the stored endpoint goes stale, the next send gets a 410, the row is
 * deleted — and the device keeps believing it is subscribed while nothing will
 * ever arrive again.
 */
async function handleSubscriptionRotateRequest(
  request: Request,
  env: Env,
  origin: string | null,
) {
  if (request.method !== "POST") {
    return createJSONResponse({ error: "Method not allowed" }, 405);
  }
  const originError = rejectDisallowedOrigin(request, origin);
  if (originError) return originError;
  const body = await parseJSONBody<{
    oldEndpoint?: string;
    subscription?: PushSubscriptionRequest;
  }>(request);
  const subscription = parsePushSubscription(body?.subscription);
  if (!subscription || !isValidEndpoint(body?.oldEndpoint)) {
    return createJSONResponse(
      { error: "Invalid request" },
      400,
      createCorsHeaders(origin),
    );
  }
  const rotated = await rotateSubscription(
    env.DB,
    body.oldEndpoint,
    subscription,
  );
  return createJSONResponse({ rotated }, 200, createCorsHeaders(origin));
}

/**
 * Sends a real push to one device on request.
 *
 * A locally shown notification proves only that the browser can display one. A
 * user who has just switched notifications on needs to know that the *whole*
 * path works, and nothing short of an actual delivery establishes that.
 */
async function handleTestNotificationRequest(
  request: Request,
  env: Env,
  origin: string | null,
) {
  if (request.method !== "POST") {
    return createJSONResponse({ error: "Method not allowed" }, 405);
  }
  const originError = rejectDisallowedOrigin(request, origin);
  if (originError) return originError;
  const cors = createCorsHeaders(origin);
  const body = await parseJSONBody<{ endpoint?: string }>(request);
  if (!isValidEndpoint(body?.endpoint)) {
    return createJSONResponse({ error: "Invalid endpoint" }, 400, cors);
  }
  const keys = getVapidKeys(env);
  if (!keys) {
    return createJSONResponse({ error: "Push is not configured" }, 503, cors);
  }
  const subscription = await readSubscription(env.DB, body.endpoint);
  if (!subscription) {
    return createJSONResponse({ error: "Unknown subscription" }, 404, cors);
  }

  // The cooldown is the UPDATE's own WHERE clause, so two concurrent requests
  // cannot both pass it.
  const cooldown = await env.DB.prepare(
    `UPDATE subscriptions SET last_test_at = unixepoch()
     WHERE endpoint = ?1
       AND (last_test_at IS NULL OR last_test_at < unixepoch() - ?2)`,
  )
    .bind(subscription.endpoint, TEST_NOTIFICATION_COOLDOWN_SECONDS)
    .run();
  if ((cooldown.meta.changes ?? 0) === 0) {
    return createJSONResponse({ error: "Too many requests" }, 429, cors);
  }

  const result = await sendWebPush(
    subscription,
    JSON.stringify({
      kind: "test",
      title: "Zustellung funktioniert",
      body: "Benachrichtigungen kommen auf diesem Gerät an.",
      url: env.APP_URL,
    }),
    keys,
    { ttlSeconds: 60, urgency: "high" },
  );

  if (result.isExpired) {
    await deleteSubscription(env.DB, subscription.endpoint);
    return createJSONResponse({ error: "Subscription expired" }, 410, cors);
  }
  if (!result.ok) {
    return createJSONResponse(
      { error: `Push service responded ${result.status}` },
      502,
      cors,
    );
  }
  return createJSONResponse({ ok: true }, 202, cors);
}

/** Admin: reserves notification events so each is announced exactly once. */
async function handleEventClaimRequest(request: Request, env: Env) {
  if (request.method !== "POST") {
    return createJSONResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await hasAdminAccess(request, env))) {
    return createJSONResponse({ error: "Unauthorized" }, 401);
  }
  const body = await parseJSONBody<{ signatures?: unknown }>(request);
  const signatures = body?.signatures;
  if (
    !Array.isArray(signatures) ||
    signatures.length > MAX_CLAIMED_EVENTS ||
    !signatures.every(
      (signature) =>
        typeof signature === "string" &&
        signature.length > 0 &&
        signature.length <= 256,
    )
  ) {
    return createJSONResponse({ error: "Invalid signatures" }, 400);
  }
  const claimed = await claimNotificationEvents(env.DB, signatures as string[]);
  return createJSONResponse({ claimed });
}

/** Admin: records that these devices were just sent to, for the daily cap. */
async function handleNotifiedRequest(request: Request, env: Env) {
  if (request.method !== "POST") {
    return createJSONResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await hasAdminAccess(request, env))) {
    return createJSONResponse({ error: "Unauthorized" }, 401);
  }
  const body = await parseJSONBody<{ endpoints?: unknown }>(request);
  const endpoints = body?.endpoints;
  if (!Array.isArray(endpoints) || !endpoints.every(isValidEndpoint)) {
    return createJSONResponse({ error: "Invalid endpoints" }, 400);
  }
  await markSubscriptionsNotified(env.DB, endpoints as string[]);
  return createJSONResponse({ ok: true });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const origin = getAllowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: createCorsHeaders(origin),
      });
    }
    if (url.pathname === "/health") {
      return createJSONResponse({ ok: true });
    }
    if (url.pathname === "/config" && request.method === "GET") {
      const originError = rejectDisallowedOrigin(request, origin);
      if (originError) return originError;
      return createJSONResponse(
        { vapidPublicKey: env.VAPID_PUBLIC_KEY },
        200,
        createCorsHeaders(origin),
      );
    }
    if (url.pathname === "/subscriptions") {
      return handleSubscriptionRequest(request, env, origin);
    }
    if (url.pathname === "/subscriptions/status") {
      return handleSubscriptionStatusRequest(request, env, origin);
    }
    if (url.pathname === "/subscriptions/rotate") {
      return handleSubscriptionRotateRequest(request, env, origin);
    }
    if (url.pathname === "/subscriptions/notified") {
      return handleNotifiedRequest(request, env);
    }
    if (url.pathname === "/notifications/test") {
      return handleTestNotificationRequest(request, env, origin);
    }
    if (url.pathname === "/events/claim") {
      return handleEventClaimRequest(request, env);
    }
    return createJSONResponse({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
