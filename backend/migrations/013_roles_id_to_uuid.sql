-- ==============================================================================
-- Migration: 013_roles_id_to_uuid.sql
-- Description: Converts roles.id from a human-readable slug (varchar,
--              e.g. 'role-1') to a real UUID primary key. Both tables that
--              reference it (change_user.role_id,
--              changedesk_identity_roles.role_id) are converted alongside
--              it in the same transaction so nothing is ever left pointing
--              at a slug that no longer exists.
--
--              The UUID assigned to each existing role is fixed and
--              explicit (not gen_random_uuid()) so it exactly matches the
--              constants backend/config/constants.js and
--              frontend/src/lib/permissions.lib.js were updated to use in
--              the same change — see those files for the mapping table.
-- Safety Guarantee: Every FK-side value is backfilled via an explicit
--              join before the old columns are dropped; row counts are
--              unchanged throughout.
-- ==============================================================================

BEGIN;

-- 1. New UUID id on roles, explicit per-row (matches application constants).
ALTER TABLE public.roles ADD COLUMN id_new uuid;

UPDATE public.roles SET id_new = '6ec4d686-d45b-4799-9ca5-47df8b129b49' WHERE id = 'role-1';
UPDATE public.roles SET id_new = 'a121824e-e101-4bb9-8d97-e321434c4741' WHERE id = 'role-2';
UPDATE public.roles SET id_new = '4956462d-8b9d-4cd5-8cbf-427ff031a217' WHERE id = 'role-2-change';
UPDATE public.roles SET id_new = '2e4b2955-17f3-40dd-8a57-0584345c5334' WHERE id = 'role-2-prespend';
UPDATE public.roles SET id_new = 'ce1292e3-6159-40e9-acd5-97b760881d73' WHERE id = 'role-2-travel';
UPDATE public.roles SET id_new = '77b8ffd1-61cb-4b95-9269-6dcac2f7781a' WHERE id = 'role-3';
UPDATE public.roles SET id_new = '0af92e2d-5a2f-4568-8c65-505bec4535f2' WHERE id = 'role-4';
UPDATE public.roles SET id_new = 'e4039e02-9139-4e9e-8e9d-28ae2338116d' WHERE id = 'role-5';
UPDATE public.roles SET id_new = '3417e445-d172-4c97-ab04-e10b8b87b3ce' WHERE id = 'role-6';

DO $$
DECLARE missing integer;
BEGIN
  SELECT COUNT(*) INTO missing FROM public.roles WHERE id_new IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'roles.id_new left NULL for % row(s) — unmapped role id present', missing;
  END IF;
END $$;

-- 2. Backfill the two FK-side columns from the same mapping (via join, not
--    re-typed literals) so they can never drift from what roles.id_new holds.
ALTER TABLE public.change_user ADD COLUMN role_id_new uuid;
UPDATE public.change_user cu SET role_id_new = r.id_new FROM public.roles r WHERE cu.role_id = r.id;

ALTER TABLE public.changedesk_identity_roles ADD COLUMN role_id_new uuid;
UPDATE public.changedesk_identity_roles cir SET role_id_new = r.id_new FROM public.roles r WHERE cir.role_id = r.id;

DO $$
DECLARE missing_cu integer; missing_cir integer;
BEGIN
  SELECT COUNT(*) INTO missing_cu FROM public.change_user WHERE role_id IS NOT NULL AND role_id_new IS NULL;
  SELECT COUNT(*) INTO missing_cir FROM public.changedesk_identity_roles WHERE role_id IS NOT NULL AND role_id_new IS NULL;
  IF missing_cu > 0 OR missing_cir > 0 THEN
    RAISE EXCEPTION 'FK backfill incomplete: change_user=% changedesk_identity_roles=%', missing_cu, missing_cir;
  END IF;
END $$;

-- 3. Drop old FKs + old (varchar) columns, rename the new ones into place.
ALTER TABLE public.change_user DROP CONSTRAINT IF EXISTS change_user_role_id_fkey;
ALTER TABLE public.changedesk_identity_roles DROP CONSTRAINT IF EXISTS changedesk_identity_roles_role_id_fkey;

ALTER TABLE public.change_user DROP COLUMN role_id;
ALTER TABLE public.change_user RENAME COLUMN role_id_new TO role_id;

ALTER TABLE public.changedesk_identity_roles DROP COLUMN role_id;
ALTER TABLE public.changedesk_identity_roles RENAME COLUMN role_id_new TO role_id;

ALTER TABLE public.roles DROP CONSTRAINT roles_pkey;
ALTER TABLE public.roles DROP COLUMN id;
ALTER TABLE public.roles RENAME COLUMN id_new TO id;
ALTER TABLE public.roles ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.roles ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

-- 4. Re-add FKs against the new UUID PK, with supporting indexes.
ALTER TABLE public.change_user
  ADD CONSTRAINT change_user_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES public.roles(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.changedesk_identity_roles
  ADD CONSTRAINT changedesk_identity_roles_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES public.roles(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_change_user_role_id ON public.change_user (role_id);
CREATE INDEX IF NOT EXISTS idx_changedesk_identity_roles_role_id ON public.changedesk_identity_roles (role_id);

COMMIT;
