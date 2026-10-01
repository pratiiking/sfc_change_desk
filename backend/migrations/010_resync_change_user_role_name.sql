-- ==============================================================================
-- Migration: 010_resync_change_user_role_name.sql
-- Description: change_user.role_name is a denormalized cache of roles.name
--              (kept alongside role_id for convenience) and had already
--              drifted for at least one row (role-6 renamed 'Board Member'
--              -> 'Board' in roles, but the cached copy on change_user
--              wasn't updated). Resyncs every row's cached name from the
--              canonical roles.name.
-- Safety Guarantee: Only touches rows where the cached name doesn't match
--              the canonical one; does not change role_id/role assignment,
--              only the display-name cache.
-- ==============================================================================

BEGIN;

UPDATE public.change_user cu
SET role_name = r.name
FROM public.roles r
WHERE cu.role_id = r.id AND cu.role_name <> r.name;

COMMIT;
