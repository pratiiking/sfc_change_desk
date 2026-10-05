BEGIN;

ALTER TABLE public.hot_desk_users DROP COLUMN is_active;
ALTER TABLE public.change_requests DROP COLUMN active_step;

COMMIT;
