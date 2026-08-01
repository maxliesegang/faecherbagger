-- Removes every trace of where subscribers live from the database.
--
-- Areas, radius and notification preferences now stay on the device: the push
-- that this service sends carries no personal content, and the service worker
-- decides locally which of a run's events to show. A subscription row is a push
-- endpoint and nothing else.
--
-- Apply once against an existing database:
--   npx wrangler d1 execute faecherbagger-push --remote \
--     --file=push-worker/migrations/0002_notification_preferences.sql \
--     --config=push-worker/wrangler.jsonc

-- Rebuilt rather than ALTER ... DROP COLUMN: databases created from earlier
-- revisions of schema.sql carry CHECK constraints naming the notification_*
-- columns, and SQLite refuses to drop a column a constraint still mentions.
-- A rebuild lands on the same table whatever shape the source database has.
CREATE TABLE subscriptions_new (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time INTEGER,
  -- Bookkeeping for the daily cap and the "Zustellung testen" rate limit.
  last_notified_at INTEGER,
  last_test_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO subscriptions_new
  (endpoint, p256dh, auth, expiration_time, created_at, updated_at)
SELECT endpoint, p256dh, auth, expiration_time, created_at, updated_at
FROM subscriptions;

DROP TABLE subscriptions;

ALTER TABLE subscriptions_new RENAME TO subscriptions;

-- Dropped with the old table; recreate against the new one.
CREATE INDEX IF NOT EXISTS subscriptions_updated_at
  ON subscriptions (updated_at);

-- Ledger of events already broadcast, keyed by the event's signature (see
-- `collectNotificationEvents`). Global rather than per subscriber — the server
-- has no way to tell who an event concerns, and does not need one.
CREATE TABLE IF NOT EXISTS notified_events (
  signature TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS notified_events_created_at
  ON notified_events (created_at);

-- Superseded by `notified_events`: dedup is now per event, not per pipeline run.
DROP TABLE IF EXISTS broadcasts;
