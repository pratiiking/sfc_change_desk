BEGIN;

-- A real reference table for approval stages instead of hand-typing the
-- same two strings ('manager_review'/'stage_2_review') at every call site.
-- Adding or removing a stage later is a data change here, not a hunt
-- through service code for hardcoded string literals.
CREATE TABLE public.approval_stages (
  id smallint PRIMARY KEY,
  code character varying(32) NOT NULL UNIQUE,
  name character varying(100) NOT NULL,
  sequence smallint NOT NULL
);
INSERT INTO public.approval_stages (id, code, name, sequence) VALUES
  (1, 'manager_review', 'Manager Review', 1),
  (2, 'stage_2_review', 'Stage 2 Review', 2);

ALTER TABLE public.pre_spend_approvals ADD COLUMN stage_id smallint REFERENCES public.approval_stages(id);
UPDATE public.pre_spend_approvals SET stage_id = (SELECT id FROM public.approval_stages WHERE code = stage);
ALTER TABLE public.pre_spend_approvals ALTER COLUMN stage_id SET NOT NULL;
ALTER TABLE public.pre_spend_approvals DROP COLUMN stage;

ALTER TABLE public.travel_approvals ADD COLUMN stage_id smallint REFERENCES public.approval_stages(id);
UPDATE public.travel_approvals SET stage_id = (SELECT id FROM public.approval_stages WHERE code = stage);
ALTER TABLE public.travel_approvals ALTER COLUMN stage_id SET NOT NULL;
ALTER TABLE public.travel_approvals DROP COLUMN stage;

COMMIT;
