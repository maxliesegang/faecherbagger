CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time INTEGER,
  notification_longitude REAL,
  notification_latitude REAL,
  notification_radius_m INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (
    notification_longitude IS NULL OR
    notification_longitude BETWEEN -180 AND 180
  ),
  CHECK (
    notification_latitude IS NULL OR
    notification_latitude BETWEEN -90 AND 90
  ),
  CHECK (
    notification_radius_m IS NULL OR
    notification_radius_m BETWEEN 1000 AND 50000
  )
);

CREATE INDEX IF NOT EXISTS subscriptions_updated_at
  ON subscriptions (updated_at);

CREATE TABLE IF NOT EXISTS broadcasts (
  fetched_at TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
