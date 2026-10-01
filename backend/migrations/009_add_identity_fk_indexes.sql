-- ==============================================================================
-- Migration: 009_add_identity_fk_indexes.sql
-- Description: Postgres does not auto-index the referencing side of a FK.
--              These 6 columns (added in migrations 004/005) had none,
--              despite being exactly what worklist/dashboard/audit queries
--              filter and join on.
-- Safety Guarantee: Index creation only. No data or behavior change.
-- ==============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_change_requests_approver_id ON public.change_requests (approver_id);
CREATE INDEX IF NOT EXISTS idx_pre_spend_requests_requester_id ON public.pre_spend_requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_travel_requests_requester_id ON public.travel_requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_identities_employee_id ON public.identities (employee_id);
CREATE INDEX IF NOT EXISTS idx_identities_change_user_id ON public.identities (change_user_id);

COMMIT;
