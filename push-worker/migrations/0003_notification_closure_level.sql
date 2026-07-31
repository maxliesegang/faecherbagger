-- The fan-out used to send every newly seen construction site inside a
-- subscription's radius, which included records that obstruct nothing and
-- records the source backfilled long after the work began. What a device is
-- willing to be interrupted for is now part of its subscription.
--
-- Nullable and without a backfill on purpose: an existing row has never
-- expressed a preference, and the sender reads a NULL as the default level
-- rather than as a choice. The clients update their own rows the next time they
-- re-send their subscription.
ALTER TABLE subscriptions ADD COLUMN notification_closure_level TEXT;
