-- ==============================================================================
-- Migration: 006_merge_category_role_assignments.sql
-- Description: change_manager_categories and change_implementer_categories
--              were two structurally identical tables (id, user_id,
--              category_id) distinguishing "manager" vs "implementer" only
--              by which table a row lived in. Merges them into one
--              category_role_assignments table with a `type` column.
--
--              Existing data is copied over (ids reused, already unique
--              across the two source tables — no collisions). Both old
--              tables are dropped once the copy is verified by the row
--              count check at the end.
--
--              Application code (services/changeRequest.service.js,
--              identityResolver.service.js, userManagement.service.js)
--              keeps using the ChangeManagerCategory / ChangeImplementerCategory
--              model names unchanged — see models/index.js, which now maps
--              both onto this one table via a scope + a beforeValidate hook
--              that force-sets `type`.
-- Safety Guarantee: Data-preserving copy, verified before the old tables
--              are dropped. user_id keeps its identities FK.
-- ==============================================================================

BEGIN;

CREATE TABLE public.category_role_assignments (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    category_id character varying NOT NULL REFERENCES public.catalog_categories(id) ON DELETE CASCADE,
    type character varying NOT NULL CHECK (type IN ('manager', 'implementer')),
    CONSTRAINT category_role_assignments_pkey PRIMARY KEY (id),
    CONSTRAINT category_role_assignments_user_category_type_unique UNIQUE (user_id, category_id, type)
);

INSERT INTO public.category_role_assignments (id, user_id, category_id, type)
SELECT id, user_id, category_id, 'manager' FROM public.change_manager_categories;

INSERT INTO public.category_role_assignments (id, user_id, category_id, type)
SELECT id, user_id, category_id, 'implementer' FROM public.change_implementer_categories;

ALTER TABLE public.category_role_assignments
  ADD CONSTRAINT category_role_assignments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.identities(id)
  ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

DO $$
DECLARE
  old_count integer;
  new_count integer;
BEGIN
  SELECT (SELECT COUNT(*) FROM public.change_manager_categories) + (SELECT COUNT(*) FROM public.change_implementer_categories) INTO old_count;
  SELECT COUNT(*) FROM public.category_role_assignments INTO new_count;
  IF old_count <> new_count THEN
    RAISE EXCEPTION 'Row count mismatch after copy: old=% new=%', old_count, new_count;
  END IF;
END $$;

DROP TABLE public.change_manager_categories;
DROP TABLE public.change_implementer_categories;

COMMIT;
