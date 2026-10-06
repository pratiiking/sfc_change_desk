BEGIN;

-- Splits the JSONB-blob "everything in one row" data on pre_spend_requests
-- and travel_requests into proper child tables, mirroring the design
-- change_request_approvals already uses for change_requests: one row per
-- vendor quote, one row per approval decision, each with a real FK instead
-- of an unindexed, unqueryable JSON array growing inside the parent row.

-- ---------- pre_spend_vendor_quotes ----------
CREATE TABLE public.pre_spend_vendor_quotes (
  id SERIAL PRIMARY KEY,
  pre_spend_request_id character varying NOT NULL REFERENCES public.pre_spend_requests(id) ON DELETE CASCADE,
  name character varying(255) NOT NULL,
  amount numeric(14,2),
  quote_date date,
  file_name character varying(255),
  file_url character varying(500),
  is_selected boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX pre_spend_vendor_quotes_request_id_idx ON public.pre_spend_vendor_quotes (pre_spend_request_id);

INSERT INTO public.pre_spend_vendor_quotes (pre_spend_request_id, name, amount, quote_date, file_name, file_url, is_selected)
SELECT
  ps.id,
  v.item->>'name',
  NULLIF(regexp_replace(COALESCE(v.item->>'amount', ''), '[^0-9.]', '', 'g'), '')::numeric,
  CASE WHEN v.item->>'date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (v.item->>'date')::date ELSE NULL END,
  NULLIF(v.item->>'fileName', ''),
  NULLIF(v.item->>'fileUrl', ''),
  (v.item->>'name') = ps.selected_vendor
FROM public.pre_spend_requests ps
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ps.vendors, '[]'::jsonb)) AS v(item)
WHERE jsonb_typeof(ps.vendors) = 'array' AND jsonb_array_length(ps.vendors) > 0;

-- ---------- pre_spend_approvals ----------
CREATE TABLE public.pre_spend_approvals (
  id SERIAL PRIMARY KEY,
  pre_spend_request_id character varying NOT NULL REFERENCES public.pre_spend_requests(id) ON DELETE CASCADE,
  stage character varying(32) NOT NULL,
  employee_id character varying(64) NOT NULL REFERENCES public.employees(emp_id),
  decider_role character varying(100) NOT NULL,
  decision character varying(20) NOT NULL,
  comment text,
  decided_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX pre_spend_approvals_request_id_idx ON public.pre_spend_approvals (pre_spend_request_id);
CREATE INDEX pre_spend_approvals_employee_id_idx ON public.pre_spend_approvals (employee_id);

INSERT INTO public.pre_spend_approvals (pre_spend_request_id, stage, employee_id, decider_role, decision, comment, decided_at)
SELECT
  ps.id,
  CASE WHEN LOWER(h.item->>'actorRole') LIKE '%manager%' THEN 'manager_review' ELSE 'stage_2_review' END,
  e.emp_id,
  COALESCE(h.item->>'actorRole', 'Approver'),
  COALESCE(h.item->>'decision', INITCAP(h.item->>'action')),
  h.item->>'comment',
  (h.item->>'timestamp')::timestamptz
FROM public.pre_spend_requests ps
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ps.approval_history, '[]'::jsonb)) AS h(item)
JOIN public.employees e ON LOWER(e.email) = LOWER(h.item->>'actorEmail')
WHERE jsonb_typeof(ps.approval_history) = 'array' AND jsonb_array_length(ps.approval_history) > 0;

ALTER TABLE public.pre_spend_requests
  DROP COLUMN IF EXISTS vendors,
  DROP COLUMN IF EXISTS selected_vendor,
  DROP COLUMN IF EXISTS approval_history;

-- ---------- travel_approvals ----------
CREATE TABLE public.travel_approvals (
  id SERIAL PRIMARY KEY,
  travel_request_id character varying NOT NULL REFERENCES public.travel_requests(id) ON DELETE CASCADE,
  stage character varying(32) NOT NULL,
  employee_id character varying(64) NOT NULL REFERENCES public.employees(emp_id),
  decider_role character varying(100) NOT NULL,
  decision character varying(20) NOT NULL,
  comment text,
  decided_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX travel_approvals_request_id_idx ON public.travel_approvals (travel_request_id);
CREATE INDEX travel_approvals_employee_id_idx ON public.travel_approvals (employee_id);

INSERT INTO public.travel_approvals (travel_request_id, stage, employee_id, decider_role, decision, comment, decided_at)
SELECT
  tr.id,
  CASE WHEN LOWER(h.item->>'actorRole') LIKE '%manager%' THEN 'manager_review' ELSE 'stage_2_review' END,
  e.emp_id,
  COALESCE(h.item->>'actorRole', 'Approver'),
  COALESCE(h.item->>'decision', INITCAP(h.item->>'action')),
  h.item->>'comment',
  (h.item->>'timestamp')::timestamptz
FROM public.travel_requests tr
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tr.approval_history, '[]'::jsonb)) AS h(item)
JOIN public.employees e ON LOWER(e.email) = LOWER(h.item->>'actorEmail')
WHERE jsonb_typeof(tr.approval_history) = 'array' AND jsonb_array_length(tr.approval_history) > 0;

ALTER TABLE public.travel_requests
  DROP COLUMN IF EXISTS approval_history;

COMMIT;
