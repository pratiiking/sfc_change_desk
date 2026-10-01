BEGIN;

ALTER TABLE public.hot_desk_users RENAME COLUMN given_name TO first_name;
ALTER TABLE public.hot_desk_users RENAME COLUMN family_name TO last_name;
ALTER TABLE public.hot_desk_users DROP COLUMN display_name;

COMMIT;
