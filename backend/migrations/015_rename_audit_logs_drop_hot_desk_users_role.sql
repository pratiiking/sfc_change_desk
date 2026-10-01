BEGIN;

ALTER TABLE public.audit_logs RENAME TO hot_desk_audit_logs;

ALTER TABLE public.hot_desk_users DROP COLUMN role;

COMMIT;
