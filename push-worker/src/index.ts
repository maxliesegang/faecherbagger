import { isNotificationArea } from "../../src/lib/notification-area-validation.ts";

interface SubscriptionBody {
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

function json(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function allowedOrigin(request: Request, env: Env) {
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

function corsHeaders(origin: string | null): HeadersInit {
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

async function isAdmin(request: Request, env: Env) {
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

function validSubscription(value: SubscriptionBody) {
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

function parseNotificationPreferences(
  preferences: SubscriptionBody["preferences"],
) {
  if (!isNotificationArea(preferences)) return null;
  const [longitude, latitude] = preferences.center;
  return {
    longitude,
    latitude,
    radiusMeters: Math.round(preferences.radiusKm * 1_000),
  };
}

async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function handleSubscriptions(
  request: Request,
  env: Env,
  origin: string | null,
) {
  if (request.method === "POST") {
    if (request.headers.has("origin") && !origin) {
      return json({ error: "Origin not allowed" }, 403);
    }
    const subscription = await parseJson<SubscriptionBody>(request);
    if (!subscription || !validSubscription(subscription)) {
      return json({ error: "Invalid push subscription" }, 400, corsHeaders(origin));
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
    return json({ ok: true }, 201, corsHeaders(origin));
  }

  if (request.method === "DELETE") {
    const body = await parseJson<{ endpoint?: string }>(request);
    if (
      !body?.endpoint ||
      body.endpoint.length > MAX_ENDPOINT_LENGTH ||
      (request.headers.has("origin") &&
        !origin &&
        !(await isAdmin(request, env)))
    ) {
      return json({ error: "Invalid request" }, 400, corsHeaders(origin));
    }
    await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?1")
      .bind(body.endpoint)
      .run();
    return json({ ok: true }, 200, corsHeaders(origin));
  }

  if (request.method === "GET") {
    if (!(await isAdmin(request, env))) {
      return json({ error: "Unauthorized" }, 401);
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
    return json({
      subscriptions: result.results,
      nextCursor:
        result.results.length === limit && last?.endpoint ? last.endpoint : null,
    });
  }

  return json({ error: "Method not allowed" }, 405, corsHeaders(origin));
}

async function handleBroadcastClaim(request: Request, env: Env) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!(await isAdmin(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const body = await parseJson<{ fetchedAt?: string }>(request);
  if (
    !body?.fetchedAt ||
    body.fetchedAt.length > 64 ||
    Number.isNaN(Date.parse(body.fetchedAt))
  ) {
    return json({ error: "Invalid fetchedAt" }, 400);
  }
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO broadcasts (fetched_at, created_at)
     VALUES (?1, unixepoch())`,
  )
    .bind(body.fetchedAt)
    .run();
  return json({ claimed: (result.meta.changes ?? 0) > 0 });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (url.pathname === "/health") {
      return json({ ok: true });
    }
    if (url.pathname === "/config" && request.method === "GET") {
      if (request.headers.has("origin") && !origin) {
        return json({ error: "Origin not allowed" }, 403);
      }
      return json(
        { vapidPublicKey: env.VAPID_PUBLIC_KEY },
        200,
        corsHeaders(origin),
      );
    }
    if (url.pathname === "/subscriptions") {
      return handleSubscriptions(request, env, origin);
    }
    if (url.pathname === "/broadcasts/claim") {
      return handleBroadcastClaim(request, env);
    }
    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
