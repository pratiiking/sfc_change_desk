BEGIN;

-- requesterId duplicated ownership tracking that employeeId already covers
-- (every requester is necessarily an employee) and its stored values were a
-- mix of legacy formats (EMP-N, raw change_user UUIDs) left over from before
-- the hot_desk_users consolidation. Ownership, self-approval, and "My
-- Requests" now all key off employeeId -> employees.emp_id exclusively.

-- Backfill the one row whose employee_id was never resolved, using its
-- legacy EMP-<employees.id> requester_id to find the real employee.
UPDATE public.change_requests cr
SET employee_id = e.emp_id
FROM public.employees e
WHERE cr.employee_id IS NULL
  AND cr.requester_id ~ '^EMP-[0-9]+$'
  AND e.id = substring(cr.requester_id FROM 5)::integer;

ALTER TABLE public.change_requests DROP COLUMN IF EXISTS requester_id;

-- Now guaranteed non-null for every row; enforce it going forward.
ALTER TABLE public.change_requests ALTER COLUMN employee_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS change_requests_employee_id_idx ON public.change_requests USING btree (employee_id);

COMMIT;
