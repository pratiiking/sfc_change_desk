BEGIN;

-- One-time cleanup to match the new behavior: notification_jobs is now a
-- live work queue, not a permanent log. Clears out rows that had already
-- accumulated in a terminal state (sent/failed/cancelled) before the
-- worker started dropping them itself. Going forward the table only ever
-- holds pending/retrying jobs, so its row count directly answers "how many
-- notifications are still outstanding."
DELETE FROM public.notification_jobs WHERE status IN ('sent', 'failed', 'cancelled');

COMMIT;
