/**
 * D1 access for push subscriptions.
 *
 * A row is a push endpoint and nothing else — no coordinates, no radius, no
 * preferences. Which of a run's events matter to a device is decided in that
 * device's service worker, so this database cannot reveal where anyone lives
 * even if it were disclosed in full.
 */

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: number | null;
  lastNotifiedAt: number | null;
}

const SUBSCRIPTION_COLUMNS = `endpoint, p256dh, auth,
   expiration_time AS expirationTime, last_notified_at AS lastNotifiedAt`;

export async function saveSubscription(
  db: D1Database,
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
    expirationTime: number | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO subscriptions
        (endpoint, p256dh, auth, expiration_time, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, unixepoch(), unixepoch())
       ON CONFLICT(endpoint) DO UPDATE SET
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        expiration_time = excluded.expiration_time,
        updated_at = unixepoch()`,
    )
    .bind(
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      subscription.expirationTime,
    )
    .run();
}

export async function readSubscription(
  db: D1Database,
  endpoint: string,
): Promise<StoredSubscription | null> {
  return db
    .prepare(
      `SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions WHERE endpoint = ?1`,
    )
    .bind(endpoint)
    .first<StoredSubscription>();
}

export async function deleteSubscription(
  db: D1Database,
  endpoint: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM subscriptions WHERE endpoint = ?1")
    .bind(endpoint)
    .run();
}

/**
 * Moves a subscription to the endpoint the browser rotated it to. Returns false
 * when the old endpoint is unknown, which the caller reports as such.
 *
 * Renaming the endpoint in place rather than inserting a new row and deleting
 * the old one is what keeps `last_notified_at` and `last_test_at` attached to
 * the device. Recreating the row reset both to NULL, and NULL reads as "never"
 * to the daily cap and the test cooldown — so a rotation handed the device a
 * clean slate on both limits.
 */
export async function rotateSubscription(
  db: D1Database,
  oldEndpoint: string,
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
    expirationTime: number | null;
  },
): Promise<boolean> {
  const existing = await readSubscription(db, oldEndpoint);
  if (!existing) return false;

  // Rotating onto an endpoint that is already registered would collide with the
  // primary key, so that row is folded into this one first. The later of each
  // pair of timestamps wins: taking the newer one is what stops a rotation from
  // being a way to shed a limit that either row had already incurred.
  const foldTimestamps = db
    .prepare(
      `UPDATE subscriptions SET
         last_notified_at = NULLIF(MAX(
           COALESCE(last_notified_at, 0),
           COALESCE((SELECT other.last_notified_at FROM subscriptions AS other
                     WHERE other.endpoint = ?2), 0)), 0),
         last_test_at = NULLIF(MAX(
           COALESCE(last_test_at, 0),
           COALESCE((SELECT other.last_test_at FROM subscriptions AS other
                     WHERE other.endpoint = ?2), 0)), 0)
       WHERE endpoint = ?1`,
    )
    .bind(oldEndpoint, subscription.endpoint);

  const removeCollision = db
    .prepare("DELETE FROM subscriptions WHERE endpoint = ?2 AND ?2 <> ?1")
    .bind(oldEndpoint, subscription.endpoint);

  const rename = db
    .prepare(
      `UPDATE subscriptions SET
         endpoint = ?2, p256dh = ?3, auth = ?4,
         expiration_time = ?5, updated_at = unixepoch()
       WHERE endpoint = ?1`,
    )
    .bind(
      oldEndpoint,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      subscription.expirationTime,
    );

  const results = await db.batch([foldTimestamps, removeCollision, rename]);
  return (results.at(-1)?.meta.changes ?? 0) > 0;
}

export interface SubscriptionPage {
  subscriptions: StoredSubscription[];
  nextCursor: string | null;
}

/** Keyset pagination by endpoint, so the fan-out can stream large tables. */
export async function readSubscriptionPage(
  db: D1Database,
  { limit, after }: { limit: number; after: string },
): Promise<SubscriptionPage> {
  const result = await db
    .prepare(
      `SELECT ${SUBSCRIPTION_COLUMNS}
       FROM subscriptions
       WHERE endpoint > ?2
       ORDER BY endpoint
       LIMIT ?1`,
    )
    .bind(limit, after)
    .all<StoredSubscription>();

  const subscriptions = result.results;
  const lastEndpoint = subscriptions.at(-1)?.endpoint;
  return {
    subscriptions,
    nextCursor:
      subscriptions.length === limit && lastEndpoint ? lastEndpoint : null,
  };
}

export async function markSubscriptionsNotified(
  db: D1Database,
  endpoints: readonly string[],
): Promise<void> {
  if (endpoints.length === 0) return;
  await db.batch(
    endpoints.map((endpoint) =>
      db
        .prepare(
          "UPDATE subscriptions SET last_notified_at = unixepoch() WHERE endpoint = ?1",
        )
        .bind(endpoint),
    ),
  );
}

/**
 * Claims notification events, returning only those not already announced.
 *
 * `INSERT OR IGNORE` makes this idempotent: a re-run of the sender, or two runs
 * overlapping, cannot broadcast the same events twice.
 */
export async function claimNotificationEvents(
  db: D1Database,
  signatures: readonly string[],
): Promise<string[]> {
  if (signatures.length === 0) return [];
  const results = await db.batch<unknown>(
    signatures.map((signature) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO notified_events (signature, created_at) VALUES (?1, unixepoch())",
        )
        .bind(signature),
    ),
  );
  return signatures.filter((_, index) => (results[index]?.meta.changes ?? 0) > 0);
}
