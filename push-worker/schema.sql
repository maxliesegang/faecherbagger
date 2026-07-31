CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time INTEGER,
  notification_longitude REAL,
  notification_latitude REAL,
  notification_radius_m INTEGER,
  -- How disruptive a construction site has to be before this device hears
  -- about it. NULL means the subscription never said, and the sender applies
  -- its default.
  notification_closure_level TEXT,
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
  ),
  CHECK (
    notification_closure_level IS NULL OR
    notification_closure_level IN ('all', 'obstruction', 'full')
  )
);

CREATE INDEX IF NOT EXISTS subscriptions_updated_at
  ON subscriptions (updated_at);

-- One row per data run that was picked up for a push fan-out. `completed_at`
-- stays NULL until the sender reports that it walked every subscription, so an
-- interrupted run can be reclaimed instead of silently skipping the remainder.
CREATE TABLE IF NOT EXISTS broadcasts (
  fetched_at TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
