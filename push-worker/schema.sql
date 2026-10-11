-- Fresh-install schema. Existing databases are moved forward by the numbered
-- files in `migrations/`; keep the two in step when changing anything here.
--
-- Note what is *not* here: no coordinates, no radius, no notification
-- preferences. Those stay on the device, and the service worker decides locally
-- which of a run's events to show. Safari and Firefox devices report only the
-- date of their next push. No watched locations are stored; delivery dates may
-- still permit limited inferences when correlated with public construction data.
-- D1 recovery history can temporarily retain overwritten dates and deleted rows.

CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time INTEGER,
  -- Guards the per-device send rate; see the sender's daily cap.
  last_notified_at INTEGER,
  -- Rate-limits the user-triggered "Zustellung testen" push.
  last_test_at INTEGER,
  -- Safari and Firefox only: next planned push, YYYY-MM-DD in Europe/Berlin. One
  -- date, no history, no reason; see migrations/0003_next_push_on.sql.
  next_push_on TEXT,
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
