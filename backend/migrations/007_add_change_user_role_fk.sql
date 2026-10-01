-- ==============================================================================
-- Migration: 007_add_change_user_role_fk.sql
-- Description: change_user.role_id had no enforced link to roles.id (only
--              changedesk_identity_roles.role_id did). Zero orphans found
--              before applying, so this is added fully VALID, not NOT VALID.
-- Safety Guarantee: Verified zero orphans beforehand; rejects only future
--              writes of a role_id that doesn't exist in roles.
-- ==============================================================================

BEGIN;

ALTER TABLE public.change_user
  ADD CONSTRAINT change_user_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES public.roles(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

COMMIT;
