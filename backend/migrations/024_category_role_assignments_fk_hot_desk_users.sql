BEGIN;

ALTER TABLE public.category_role_assignments
  ALTER COLUMN user_id TYPE integer USING user_id::integer;

ALTER TABLE public.category_role_assignments
  ADD CONSTRAINT category_role_assignments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.hot_desk_users(id)
  ON UPDATE CASCADE ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_category_role_assignments_user_id ON public.category_role_assignments (user_id);

COMMIT;
