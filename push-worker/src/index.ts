import {
  isNotificationArea,
  roundNotificationCenter,
} from "../../src/lib/notification-area-validation.ts";

interface PushSubscriptionRequest {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  preferences?: {
    center?: unknown;
    radiusKm?: unknown;
  };
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_ENDPOINT_LENGTH = 4096;
const MAX_KEY_LENGTH = 512;

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

/**
 * Constant-time comparison of two secrets of any length. `timingSafeEqual`
 * requires equal-length inputs, so both sides are hashed first: the digests are
 * always 32 bytes and reveal nothing about the originals.
 */
async function isEqualSecret(provided: string, expected: string) {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(
    new Uint8Array(providedHash),
    new Uint8Array(expectedHash),
  );
}

async function hasAdminAccess(request: Request, env: Env) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || !env.ADMIN_TOKEN) return false;
  return isEqualSecret(
    authorization.slice("Bearer ".length),
    env.ADMIN_TOKEN,
  );
}

function isValidPushSubscription(value: PushSubscriptionRequest) {
  if (
    typeof value.endpoint !== "string" ||
    value.endpoint.length > MAX_ENDPOINT_LENGTH ||
    !value.endpoint.startsWith("https://")
  ) {
    return false;
  }
  const p256dh = value.keys?.p256dh;
  const auth = value.keys?.auth;
  return (
    typeof p256dh === "string" &&
    p256dh.length > 0 &&
    p256dh.length <= MAX_KEY_LENGTH &&
    typeof auth === "string" &&
    auth.length > 0 &&
    auth.length <= MAX_KEY_LENGTH &&
    (value.preferences === undefined ||
      parseNotificationPreferences(value.preferences) !== null)
  );
}

/**
 * The center is rounded again here, not only in the app: the service must never
 * store a more precise position than it needs, whatever a client sends.
 */
function parseNotificationPreferences(
  preferences: PushSubscriptionRequest["preferences"],
) {
  if (!isNotificationArea(preferences)) return null;
  const [longitude, latitude] = roundNotificationCenter(preferences.center);
  return {
    longitude,
    latitude,
    radiusMeters: Math.round(preferences.radiusKm * 1_000),
  };
}

/**
 * Proof that the caller holds the subscription it wants removed, not merely its
 * endpoint URL. The `auth` secret is part of the Web Push key material that the
 * subscribing browser owns, so presenting it is evidence of possession without
 * introducing an account or a token the client would have to store.
 *
 * A request for an endpoint that is not stored counts as verified: the desired
 * state is already reached, and answering differently would turn this endpoint
 * into an oracle for which endpoints exist.
 */
async function verifySubscriptionOwnership(
  env: Env,
  body: { endpoint?: string; auth?: string },
): Promise<"verified" | "malformed" | "rejected"> {
  const { auth } = body;
  if (typeof auth !== "string" || !auth || auth.length > MAX_KEY_LENGTH) {
    return "malformed";
  }
  const stored = await env.DB.prepare(
    "SELECT auth FROM subscriptions WHERE endpoint = ?1",
  )
    .bind(body.endpoint)
    .first<{ auth: string }>();
  if (!stored) return "verified";
  return (await isEqualSecret(auth, stored.auth)) ? "verified" : "rejected";
}

async function parseJSONBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function handleSubscriptionRequest(
  request: Request,
  env: Env,
  origin: string | null,
) {
  if (request.method === "POST") {
    if (request.headers.has("origin") && !origin) {
      return createJSONResponse({ error: "Origin not allowed" }, 403);
    }
    const subscription = await parseJSONBody<PushSubscriptionRequest>(request);
    if (!subscription || !isValidPushSubscription(subscription)) {
      return createJSONResponse(
        { error: "Invalid push subscription" },
        400,
        createCorsHeaders(origin),
      );
    }
    const preferences = parseNotificationPreferences(subscription.preferences);
    await env.DB.prepare(
      `INSERT INTO subscriptions
        (endpoint, p256dh, auth, expiration_time, notification_longitude,
         notification_latitude, notification_radius_m, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, unixepoch(), unixepoch())
       ON CONFLICT(endpoint) DO UPDATE SET
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        expiration_time = excluded.expiration_time,
        notification_longitude = COALESCE(
          excluded.notification_longitude,
          subscriptions.notification_longitude
        ),
        notification_latitude = COALESCE(
          excluded.notification_latitude,
          subscriptions.notification_latitude
        ),
        notification_radius_m = COALESCE(
          excluded.notification_radius_m,
          subscriptions.notification_radius_m
        ),
        updated_at = unixepoch()`,
    )
      .bind(
        subscription.endpoint,
        subscription.keys!.p256dh,
        subscription.keys!.auth,
        subscription.expirationTime ?? null,
        preferences?.longitude ?? null,
        preferences?.latitude ?? null,
        preferences?.radiusMeters ?? null,
      )
      .run();
    return createJSONResponse({ ok: true }, 201, createCorsHeaders(origin));
  }

  if (request.method === "DELETE") {
    const body = await parseJSONBody<{ endpoint?: string; auth?: string }>(
      request,
    );
    if (!body?.endpoint || body.endpoint.length > MAX_ENDPOINT_LENGTH) {
      return createJSONResponse(
        { error: "Invalid request" },
        400,
        createCorsHeaders(origin),
      );
    }

    // The fan-out uses this endpoint to prune subscriptions that the push
    // service has already rejected, and holds no `auth` key for them.
    if (!(await hasAdminAccess(request, env))) {
      if (request.headers.has("origin") && !origin) {
        return createJSONResponse({ error: "Origin not allowed" }, 403);
      }
      const proof = await verifySubscriptionOwnership(env, body);
      if (proof !== "verified") {
        return createJSONResponse(
          { error: "Invalid request" },
          proof === "malformed" ? 400 : 403,
          createCorsHeaders(origin),
        );
      }
    }

    await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?1")
      .bind(body.endpoint)
      .run();
    return createJSONResponse({ ok: true }, 200, createCorsHeaders(origin));
  }

  if (request.method === "GET") {
    if (!(await hasAdminAccess(request, env))) {
      return createJSONResponse({ error: "Unauthorized" }, 401);
    }
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number.parseInt(url.searchParams.get("limit") ?? "250", 10), 1),
      500,
    );
    const after = url.searchParams.get("after") ?? "";
    const result = await env.DB.prepare(
      `SELECT endpoint, p256dh, auth, expiration_time AS expirationTime,
          notification_longitude AS notificationLongitude,
          notification_latitude AS notificationLatitude,
          notification_radius_m AS notificationRadiusMeters
       FROM subscriptions
       WHERE endpoint > ?2
       ORDER BY endpoint
       LIMIT ?1`,
    )
      .bind(limit, after)
      .all();
    const last = result.results.at(-1) as { endpoint?: string } | undefined;
    return createJSONResponse({
      subscriptions: result.results,
      nextCursor:
        result.results.length === limit && last?.endpoint ? last.endpoint : null,
    });
  }

  return createJSONResponse(
    { error: "Method not allowed" },
    405,
    createCorsHeaders(origin),
  );
}

/**
 * How long a claimed broadcast may stay uncompleted before another run may take
 * it over. Long enough that a healthy fan-out is never overtaken, short enough
 * that a crashed one is retried by the next scheduled data update.
 */
const BROADCAST_STALE_SECONDS = 30 * 60;

function readBroadcastKey(body: { fetchedAt?: string } | null) {
  if (
    !body?.fetchedAt ||
    body.fetchedAt.length > 64 ||
    Number.isNaN(Date.parse(body.fetchedAt))
  ) {
    return null;
  }
  return body.fetchedAt;
}

/**
 * Claims a data run for exactly one sender. A run is claimable when it has
 * never been claimed, or when a previous claim neither completed nor was
 * refreshed within {@link BROADCAST_STALE_SECONDS} — that second case is a
 * sender that died mid-fan-out, whose remaining subscriptions would otherwise
 * never be notified. Re-claiming can repeat a notification for the devices the
 * failed run already reached; the notification tag collapses those on the
 * device, which is the better trade against silently dropping the rest.
 */
async function handleBroadcastClaimRequest(request: Request, env: Env) {
  if (request.method !== "POST") {
    return createJSONResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await hasAdminAccess(request, env))) {
    return createJSONResponse({ error: "Unauthorized" }, 401);
  }
  const fetchedAt = readBroadcastKey(
    await parseJSONBody<{ fetchedAt?: string }>(request),
  );
  if (!fetchedAt) {
    return createJSONResponse({ error: "Invalid fetchedAt" }, 400);
  }

  // One statement so two concurrent senders cannot both take the same run:
  // the insert wins for a fresh run, the conflict branch only updates a claim
  // that is stale, and `changes` reports whether this caller got it.
  const result = await env.DB.prepare(
    `INSERT INTO broadcasts (fetched_at, created_at)
     VALUES (?1, unixepoch())
     ON CONFLICT(fetched_at) DO UPDATE SET created_at = unixepoch()
     WHERE broadcasts.completed_at IS NULL
       AND broadcasts.created_at < unixepoch() - ?2`,
  )
    .bind(fetchedAt, BROADCAST_STALE_SECONDS)
    .run();
  return createJSONResponse({ claimed: (result.meta.changes ?? 0) > 0 });
}

/** Marks a claimed fan-out as finished, so it is never reclaimed. */
async function handleBroadcastCompleteRequest(request: Request, env: Env) {
  if (request.method !== "POST") {
    return createJSONResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await hasAdminAccess(request, env))) {
    return createJSONResponse({ error: "Unauthorized" }, 401);
  }
  const fetchedAt = readBroadcastKey(
    await parseJSONBody<{ fetchedAt?: string }>(request),
  );
  if (!fetchedAt) {
    return createJSONResponse({ error: "Invalid fetchedAt" }, 400);
  }

  const result = await env.DB.prepare(
    `UPDATE broadcasts SET completed_at = unixepoch()
     WHERE fetched_at = ?1 AND completed_at IS NULL`,
  )
    .bind(fetchedAt)
    .run();
  return createJSONResponse({ completed: (result.meta.changes ?? 0) > 0 });
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
      if (request.headers.has("origin") && !origin) {
        return createJSONResponse({ error: "Origin not allowed" }, 403);
      }
      return createJSONResponse(
        { vapidPublicKey: env.VAPID_PUBLIC_KEY },
        200,
        createCorsHeaders(origin),
      );
    }
    if (url.pathname === "/subscriptions") {
      return handleSubscriptionRequest(request, env, origin);
    }
    if (url.pathname === "/broadcasts/claim") {
      return handleBroadcastClaimRequest(request, env);
    }
    if (url.pathname === "/broadcasts/complete") {
      return handleBroadcastCompleteRequest(request, env);
    }
    return createJSONResponse({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
