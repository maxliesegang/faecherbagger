CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS subscriptions_updated_at
  ON subscriptions (updated_at);

CREATE TABLE IF NOT EXISTS broadcasts (
  fetched_at TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
