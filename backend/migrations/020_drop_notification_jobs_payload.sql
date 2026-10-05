BEGIN;

ALTER TABLE public.notification_jobs DROP COLUMN payload;

COMMIT;
