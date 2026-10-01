BEGIN;

ALTER TABLE public.hot_desk_users ADD COLUMN role_id uuid;

-- Default: everyone maps to the legacy "Admin" role.
UPDATE public.hot_desk_users
SET role_id = (SELECT id FROM public.roles WHERE name = 'Admin');

-- Override: Pratiek Saraiya and Ashish Chikane get Super Admin.
UPDATE public.hot_desk_users
SET role_id = (SELECT id FROM public.roles WHERE name = 'Super Admin')
WHERE lower(email) IN ('pratiek@stfox.com', 'ashish.chikane@stfox.com');

DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count FROM public.hot_desk_users WHERE role_id IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'hot_desk_users backfill incomplete: % rows with NULL role_id', missing_count;
  END IF;
END $$;

ALTER TABLE public.hot_desk_users ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE public.hot_desk_users
  ADD CONSTRAINT hot_desk_users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_hot_desk_users_role_id ON public.hot_desk_users (role_id);

COMMIT;
