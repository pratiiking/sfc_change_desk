-- ==============================================================================
-- Migration: 011_identities_employee_fk_via_empid.sql
-- Description: identities.employee_id referenced employees.id (the internal
--              serial PK). Switches it to reference employees.emp_id (the
--              business identifier, e.g. 'SFC-0001') instead — the key
--              that's actually meaningful outside this one table and that
--              identityResolver.service.js already treats as the
--              authoritative employee identifier (`authoritativeEmpId`).
--              Nothing in application code reads identities.employee_id
--              today (verified — it's FK-target infrastructure only), so
--              this is a pure schema correction.
-- Safety Guarantee: Verified beforehand that every employees.emp_id is
--              non-null and unique (177/177). Backfills employee_id from
--              the old numeric value to the matching emp_id before
--              dropping the old column.
-- ==============================================================================

BEGIN;

ALTER TABLE public.employees ADD CONSTRAINT employees_emp_id_key UNIQUE (emp_id);

ALTER TABLE public.identities ADD COLUMN employee_emp_id character varying;

UPDATE public.identities i
SET employee_emp_id = e.emp_id
FROM public.employees e
WHERE i.employee_id = e.id;

ALTER TABLE public.identities DROP CONSTRAINT IF EXISTS identities_employee_id_fkey;
ALTER TABLE public.identities DROP COLUMN employee_id;
ALTER TABLE public.identities RENAME COLUMN employee_emp_id TO employee_id;

ALTER TABLE public.identities
  ADD CONSTRAINT identities_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees(emp_id)
  ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_identities_employee_id ON public.identities (employee_id);

COMMIT;
