import {
  isHomeArea,
  roundHomeAreaCenter,
} from "../../src/shared/home-area-validation.ts";

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

/** Everything a handler needs about the caller beyond the request itself. */
interface RequestContext {
  env: Env;
  /** The caller's origin when it is allowed, `null` otherwise. */
  origin: string | null;
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
 * Rejects a browser request from an origin that is not allowed. A request
 * without an `Origin` header is not from a browser page and passes; the
 * endpoints it can reach are either harmless or require the admin token.
 */
function rejectDisallowedOrigin(request: Request, origin: string | null) {
  return request.headers.has("origin") && !origin
    ? createJSONResponse({ error: "Origin not allowed" }, 403)
    : null;
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
  return isEqualSecret(authorization.slice("Bearer ".length), env.ADMIN_TOKEN);
}

async function parseJSONBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
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
  if (!isHomeArea(preferences)) return null;
  const [longitude, latitude] = roundHomeAreaCenter(preferences.center);
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

/** Stores a new subscription or refreshes the keys and area of a known one. */
async function upsertSubscription(request: Request, { env, origin }: RequestContext) {
  const disallowedOrigin = rejectDisallowedOrigin(request, origin);
  if (disallowedOrigin) return disallowedOrigin;

  const subscription = await parseJSONBody<PushSubscriptionRequest>(request);
  if (!subscription || !isValidPushSubscription(subscription)) {
    return createJSONResponse(
      { error: "Invalid push subscription" },
      400,
      createCorsHeaders(origin),
    );
  }
  const preferences = parseNotificationPreferences(subscription.preferences);
  // A re-subscription without preferences keeps the stored area: the browser
  // may re-send a subscription before the app has restored its local state.
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

/** Removes a subscription for its owner, or for the fan-out pruning dead ones. */
async function deleteSubscription(request: Request, { env, origin }: RequestContext) {
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
    const disallowedOrigin = rejectDisallowedOrigin(request, origin);
    if (disallowedOrigin) return disallowedOrigin;

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

const SUBSCRIPTION_PAGE_SIZE = 250;
const MAX_SUBSCRIPTION_PAGE_SIZE = 500;

/** Administrative, keyset-paginated read for the notification fan-out. */
async function listSubscriptions(request: Request, { env }: RequestContext) {
  if (!(await hasAdminAccess(request, env))) {
    return createJSONResponse({ error: "Unauthorized" }, 401);
  }
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(
      Number.parseInt(
        url.searchParams.get("limit") ?? String(SUBSCRIPTION_PAGE_SIZE),
        10,
      ),
      1,
    ),
    MAX_SUBSCRIPTION_PAGE_SIZE,
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

/** What a broadcast endpoint does once the caller and the data run are known. */
type BroadcastOperation = (env: Env, fetchedAt: string) => Promise<Response>;

/**
 * Shared entry conditions for the administrative broadcast endpoints: a POST
 * from the fan-out, authenticated, naming an existing data run.
 */
function createBroadcastHandler(operate: BroadcastOperation) {
  return async (request: Request, { env }: RequestContext) => {
    if (!(await hasAdminAccess(request, env))) {
      return createJSONResponse({ error: "Unauthorized" }, 401);
    }
    const fetchedAt = readBroadcastKey(
      await parseJSONBody<{ fetchedAt?: string }>(request),
    );
    if (!fetchedAt) {
      return createJSONResponse({ error: "Invalid fetchedAt" }, 400);
    }
    return operate(env, fetchedAt);
  };
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
const claimBroadcast: BroadcastOperation = async (env, fetchedAt) => {
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
};

/**
 * The most recent data run whose fan-out completed, or `null` when none ever
 * has. This is the cutoff the sender selects on: notification delivery is this
 * service's state, not the data repository's, so a run whose fan-out died must
 * not advance it. The next sender then picks up everything the failed one owed.
 */
async function readLastCompletedBroadcast(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT fetched_at FROM broadcasts
     WHERE completed_at IS NOT NULL
     ORDER BY fetched_at DESC LIMIT 1`,
  ).first<{ fetched_at: string }>();
  return createJSONResponse({ fetchedAt: row?.fetched_at ?? null });
}

/** Marks a claimed fan-out as finished, so it is never reclaimed. */
const completeBroadcast: BroadcastOperation = async (env, fetchedAt) => {
  const result = await env.DB.prepare(
    `UPDATE broadcasts SET completed_at = unixepoch()
     WHERE fetched_at = ?1 AND completed_at IS NULL`,
  )
    .bind(fetchedAt)
    .run();
  return createJSONResponse({ completed: (result.meta.changes ?? 0) > 0 });
};

type RouteHandler = (
  request: Request,
  context: RequestContext,
) => Response | Promise<Response>;

/**
 * The service's surface, by path and then by method. Keeping it declarative
 * makes the unhandled cases uniform: an unknown path is a 404, a known path
 * with an unsupported method a 405, and neither reaches a handler.
 */
const ROUTES: Record<string, Partial<Record<string, RouteHandler>>> = {
  "/health": {
    // HEAD as well, because uptime checks commonly use it.
    GET: () => createJSONResponse({ ok: true }),
    HEAD: () => createJSONResponse({ ok: true }),
  },
  "/config": {
    GET: (request, { env, origin }) => {
      const disallowedOrigin = rejectDisallowedOrigin(request, origin);
      return (
        disallowedOrigin ??
        createJSONResponse(
          { vapidPublicKey: env.VAPID_PUBLIC_KEY },
          200,
          createCorsHeaders(origin),
        )
      );
    },
  },
  "/subscriptions": {
    POST: upsertSubscription,
    DELETE: deleteSubscription,
    GET: listSubscriptions,
  },
  "/broadcasts/last": {
    GET: async (request, { env }) =>
      (await hasAdminAccess(request, env))
        ? readLastCompletedBroadcast(env)
        : createJSONResponse({ error: "Unauthorized" }, 401),
  },
  "/broadcasts/claim": {
    POST: createBroadcastHandler(claimBroadcast),
  },
  "/broadcasts/complete": {
    POST: createBroadcastHandler(completeBroadcast),
  },
};

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

    const route = ROUTES[url.pathname];
    if (!route) return createJSONResponse({ error: "Not found" }, 404);

    const handler = route[request.method];
    if (!handler) {
      return createJSONResponse(
        { error: "Method not allowed" },
        405,
        createCorsHeaders(origin),
      );
    }
    return handler(request, { env, origin });
  },
} satisfies ExportedHandler<Env>;
