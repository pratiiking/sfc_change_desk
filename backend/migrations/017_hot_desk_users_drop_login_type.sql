BEGIN;

ALTER TABLE public.hot_desk_users DROP COLUMN login_type;

COMMIT;
