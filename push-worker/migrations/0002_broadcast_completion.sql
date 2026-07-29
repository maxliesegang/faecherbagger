-- A claim alone could not tell an in-flight broadcast from one that died
-- half-way through its fan-out, so a crashed run blocked its own retry and the
-- subscriptions after the crash point were never notified. Completion is now
-- recorded separately; a claimed but uncompleted broadcast becomes reclaimable
-- once it is older than the worker's stale threshold.
ALTER TABLE broadcasts ADD COLUMN completed_at INTEGER;

-- Broadcasts recorded before this migration ran to completion; without this
-- they would look stale and be re-sent once.
UPDATE broadcasts SET completed_at = created_at WHERE completed_at IS NULL;
