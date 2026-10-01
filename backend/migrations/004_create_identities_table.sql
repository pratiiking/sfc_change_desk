-- ==============================================================================
-- Migration: 004_create_identities_table.sql
-- Description: Introduces a canonical identity table + alias lookup, mirroring
--              the resolution logic that already lives in
--              services/identityResolver.service.js (a person is either a
--              ChangeUser profile, or — if they have none yet — an Employee
--              directory record referenced as `EMP-<employees.id>`).
--
--              This does NOT touch change_requests / audit_logs / etc. yet —
--              see backend/scripts/backfillIdentities.js for normalizing
--              their existing values onto this table, which runs separately
--              and is reviewed before any FK is added against it.
-- Safety Guarantee: Purely additive. No existing table, column, or row is
--              modified.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.identities (
    id character varying NOT NULL,
    source character varying NOT NULL CHECK (source IN ('CHANGE_USER', 'EMPLOYEE_DIRECTORY', 'SYSTEM')),
    employee_id integer REFERENCES public.employees(id) ON DELETE SET NULL,
    change_user_id character varying REFERENCES public.change_user(id) ON DELETE SET NULL,
    email character varying,
    display_name character varying,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT identities_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS identities_email_key ON public.identities (lower(email)) WHERE email IS NOT NULL;

-- Every string ever used in the codebase/data to refer to a given identity
-- (plain id, `EMP-<id>`, `S8-<id>`, `usr-<id>`, email) resolves here to one
-- canonical identities.id. Populated by backfillIdentities.js.
CREATE TABLE IF NOT EXISTS public.identity_aliases (
    alias character varying NOT NULL,
    identity_id character varying NOT NULL REFERENCES public.identities(id) ON DELETE CASCADE,
    CONSTRAINT identity_aliases_pkey PRIMARY KEY (alias)
);

COMMIT;
