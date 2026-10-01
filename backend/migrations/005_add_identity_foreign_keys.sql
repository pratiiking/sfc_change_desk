-- ==============================================================================
-- Migration: 005_add_identity_foreign_keys.sql
-- Description: Adds real FK constraints from every identity-reference column
--              onto public.identities, now that backfillIdentities.js has
--              normalized the resolvable values onto identities.id.
--
--              Added as NOT VALID: Postgres still enforces them for every
--              new INSERT/UPDATE from this point forward, it just skips
--              validating pre-existing rows at ADD time. A small number of
--              historical rows (test-data stragglers: orphaned profile
--              UUIDs, placeholder manager emails, a legacy `usr-1` id, and
--              two bogus `EMP-<timestamp>` values) have no known identity
--              and were intentionally left unresolved by the backfill
--              rather than guessed at — see its printed report.
--
--              Once those specific rows are cleaned up or mapped by hand,
--              run (not included here, deliberately manual):
--                ALTER TABLE <table> VALIDATE CONSTRAINT <name>;
--              to get full back-validation with zero downtime.
-- Safety Guarantee: Does not change any data. Rejects only *new* writes
--              that reference an identity id not present in `identities`.
-- ==============================================================================

BEGIN;

ALTER TABLE public.change_requests
  ADD CONSTRAINT change_requests_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES public.identities(id)
  ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE public.change_requests
  ADD CONSTRAINT change_requests_approver_id_fkey
  FOREIGN KEY (approver_id) REFERENCES public.identities(id)
  ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE public.change_request_approvals
  ADD CONSTRAINT change_request_approvals_approver_id_fkey
  FOREIGN KEY (approver_id) REFERENCES public.identities(id)
  ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.pre_spend_requests
  ADD CONSTRAINT pre_spend_requests_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES public.identities(id)
  ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE public.travel_requests
  ADD CONSTRAINT travel_requests_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES public.identities(id)
  ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.identities(id)
  ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE public.change_manager_categories
  ADD CONSTRAINT change_manager_categories_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.identities(id)
  ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

ALTER TABLE public.change_implementer_categories
  ADD CONSTRAINT change_implementer_categories_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.identities(id)
  ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

COMMIT;
