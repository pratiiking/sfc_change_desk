BEGIN;

-- Same normalization already applied to change_requests: stop storing
-- requester/traveller/manager name+email as free text (duplicating, and
-- able to drift from, the employees table) and instead store only the FK
-- (emp_id), joining to employees for display.

-- ---------- pre_spend_requests ----------
ALTER TABLE public.pre_spend_requests ADD COLUMN employee_id character varying(64);
ALTER TABLE public.pre_spend_requests ADD COLUMN manager_id character varying(64);

UPDATE public.pre_spend_requests ps
SET employee_id = e.emp_id
FROM public.employees e
WHERE LOWER(e.email) = LOWER(ps.requester_email);

UPDATE public.pre_spend_requests ps
SET manager_id = e.emp_id
FROM public.employees e
WHERE LOWER(e.email) = LOWER(ps.manager_email);

ALTER TABLE public.pre_spend_requests
  ADD CONSTRAINT pre_spend_requests_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES public.employees(emp_id)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.pre_spend_requests
  ADD CONSTRAINT pre_spend_requests_manager_id_fkey
    FOREIGN KEY (manager_id) REFERENCES public.employees(emp_id)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.pre_spend_requests ALTER COLUMN employee_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS pre_spend_requests_employee_id_idx ON public.pre_spend_requests USING btree (employee_id);
CREATE INDEX IF NOT EXISTS pre_spend_requests_manager_id_idx ON public.pre_spend_requests USING btree (manager_id);

ALTER TABLE public.pre_spend_requests
  DROP COLUMN IF EXISTS requester_id,
  DROP COLUMN IF EXISTS requester_name,
  DROP COLUMN IF EXISTS requester_email,
  DROP COLUMN IF EXISTS manager_name,
  DROP COLUMN IF EXISTS manager_email;

-- ---------- travel_requests ----------
ALTER TABLE public.travel_requests ADD COLUMN employee_id character varying(64);
ALTER TABLE public.travel_requests ADD COLUMN manager_id character varying(64);

UPDATE public.travel_requests tr
SET employee_id = e.emp_id
FROM public.employees e
WHERE LOWER(e.email) = LOWER(tr.traveller_email);

UPDATE public.travel_requests tr
SET manager_id = e.emp_id
FROM public.employees e
WHERE LOWER(e.email) = LOWER(tr.manager_email);

ALTER TABLE public.travel_requests
  ADD CONSTRAINT travel_requests_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES public.employees(emp_id)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.travel_requests
  ADD CONSTRAINT travel_requests_manager_id_fkey
    FOREIGN KEY (manager_id) REFERENCES public.employees(emp_id)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.travel_requests ALTER COLUMN employee_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS travel_requests_employee_id_idx ON public.travel_requests USING btree (employee_id);
CREATE INDEX IF NOT EXISTS travel_requests_manager_id_idx ON public.travel_requests USING btree (manager_id);

ALTER TABLE public.travel_requests
  DROP COLUMN IF EXISTS requester_id,
  DROP COLUMN IF EXISTS traveller_name,
  DROP COLUMN IF EXISTS traveller_email,
  DROP COLUMN IF EXISTS manager_name,
  DROP COLUMN IF EXISTS manager_email;

COMMIT;
