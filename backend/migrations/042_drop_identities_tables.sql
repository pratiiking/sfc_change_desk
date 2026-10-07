BEGIN;

-- identities / identity_aliases were the universal alias-resolution layer
-- for the old, fragmented identity system (EMP-N/S8-N/usr-N/change_user
-- UUID/email all resolving to one canonical row). Nothing in the live
-- codebase reads or writes either table -- IdentityResolver resolves
-- directly against hot_desk_users/employees, and every consumer that would
-- have needed alias resolution (category_role_assignments.user_id,
-- change_requests/pre_spend_requests/travel_requests employee_id/manager_id)
-- is now a real FK to hot_desk_users or employees. Dead, superseded data.
DROP TABLE IF EXISTS public.identity_aliases;
DROP TABLE IF EXISTS public.identities;

COMMIT;
