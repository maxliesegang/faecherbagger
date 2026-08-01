-- Fresh-install schema. Existing databases are moved forward by the numbered
-- files in `migrations/`; keep the two in step when changing anything here.
--
-- Note what is *not* here: no coordinates, no radius, no notification
-- preferences. Those stay on the device, and the service worker decides locally
-- which of a run's events to show. This database cannot reveal where any
-- subscriber lives.

CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time INTEGER,
  -- Guards the per-device send rate; see the sender's daily cap.
  last_notified_at INTEGER,
  -- Rate-limits the user-triggered "Zustellung testen" push.
  last_test_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS subscriptions_updated_at
  ON subscriptions (updated_at);

-- Ledger of events already broadcast, keyed by the event's signature (see
-- `collectNotificationEvents`), so each is announced exactly once.
CREATE TABLE IF NOT EXISTS notified_events (
  signature TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS notified_events_created_at
  ON notified_events (created_at);
