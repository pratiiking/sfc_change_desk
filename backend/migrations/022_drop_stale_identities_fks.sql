BEGIN;

-- The `identities` table is no longer kept in sync with the live identity
-- sources (employees, change_user, changedesk_identity_roles) — nothing in
-- application code reads from it (IdentityResolver resolves directly from
-- those tables instead), and it was only ever populated by a one-time
-- backfill script. These FK constraints enforce referential integrity
-- against that stale snapshot, which now actively rejects legitimate writes
-- for any identity added or changed since the backfill ran (e.g. every
-- S8-* hot_desk_users-linked id, never backfilled at all).
--
-- identity_aliases.identity_id's own FK is left alone since it's internal
-- to the identities subsystem itself, not a cross-cutting business table.

ALTER TABLE public.change_requests DROP CONSTRAINT IF EXISTS change_requests_requester_id_fkey;
ALTER TABLE public.change_requests DROP CONSTRAINT IF EXISTS change_requests_approver_id_fkey;
ALTER TABLE public.change_request_approvals DROP CONSTRAINT IF EXISTS change_request_approvals_approver_id_fkey;
ALTER TABLE public.pre_spend_requests DROP CONSTRAINT IF EXISTS pre_spend_requests_requester_id_fkey;
ALTER TABLE public.travel_requests DROP CONSTRAINT IF EXISTS travel_requests_requester_id_fkey;
ALTER TABLE public.hot_desk_audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE public.category_role_assignments DROP CONSTRAINT IF EXISTS category_role_assignments_user_id_fkey;

COMMIT;
