BEGIN;

-- Normalize employee/manager identity on change_requests: stop storing
-- name/email as free text (duplicated from, and able to drift from, the
-- employees table) and instead store only the FK (emp_id), joining to
-- employees for display. This also removes the ability for a client to
-- submit an employeeName/employeeEmail that differs from who they actually
-- are, since display values are now only ever derived via the FK join.

-- 1. employee_id already holds clean, matching employees.emp_id values
--    (verified live), but normalize '' to NULL before adding the FK.
UPDATE public.change_requests SET employee_id = NULL WHERE employee_id = '';

-- 2. Add manager_id and backfill it from the existing manager_email where
--    it matches a real employee. Rows with garbage/test manager_email
--    values that don't match any employee are left NULL.
ALTER TABLE public.change_requests ADD COLUMN manager_id character varying;

UPDATE public.change_requests cr
SET manager_id = e.emp_id
FROM public.employees e
WHERE LOWER(e.email) = LOWER(cr.manager_email);

-- 3. Add the real FK constraints.
ALTER TABLE public.change_requests
  ADD CONSTRAINT change_requests_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES public.employees(emp_id)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.change_requests
  ADD CONSTRAINT change_requests_manager_id_fkey
    FOREIGN KEY (manager_id) REFERENCES public.employees(emp_id)
    ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS change_requests_manager_id_idx ON public.change_requests USING btree (manager_id);

-- 4. Drop the now-redundant snapshot text columns.
ALTER TABLE public.change_requests
  DROP COLUMN IF EXISTS employee_name,
  DROP COLUMN IF EXISTS employee_email,
  DROP COLUMN IF EXISTS manager_name,
  DROP COLUMN IF EXISTS manager_email;

COMMIT;
