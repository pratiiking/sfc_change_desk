BEGIN;

-- 1. A real, tiny reference table for decision outcomes instead of writing
--    the same fixed strings ('Approved'/'Rejected') by hand everywhere.
CREATE TABLE public.approval_decisions (
  id smallint PRIMARY KEY,
  code character varying(20) NOT NULL UNIQUE
);
INSERT INTO public.approval_decisions (id, code) VALUES (1, 'Approved'), (2, 'Rejected');

-- 2. pre_spend_approvals: rename the decider's employee FK to decider_id
--    (employee_id elsewhere always means "the requester" -- this is a
--    different person, the approver, so it needs its own name). Add
--    decider_role_id (FK to hot_desk_roles, nullable -- a plain Reporting
--    Manager with no elevated role has none) and decision_id (FK to the
--    new lookup table), replacing the hardcoded decider_role/decision text.
ALTER TABLE public.pre_spend_approvals RENAME COLUMN employee_id TO decider_id;

ALTER TABLE public.pre_spend_approvals ADD COLUMN decider_role_id uuid REFERENCES public.hot_desk_roles(id);
UPDATE public.pre_spend_approvals ps
SET decider_role_id = r.id
FROM public.hot_desk_roles r
WHERE r.name = CASE ps.decider_role WHEN 'Board Member' THEN 'Board' ELSE ps.decider_role END;

ALTER TABLE public.pre_spend_approvals ADD COLUMN decision_id smallint REFERENCES public.approval_decisions(id);
UPDATE public.pre_spend_approvals
SET decision_id = CASE WHEN decision ILIKE '%approved%' THEN 1 ELSE 2 END;
ALTER TABLE public.pre_spend_approvals ALTER COLUMN decision_id SET NOT NULL;

ALTER TABLE public.pre_spend_approvals DROP COLUMN decider_role;
ALTER TABLE public.pre_spend_approvals DROP COLUMN decision;

-- 3. Same for travel_approvals.
ALTER TABLE public.travel_approvals RENAME COLUMN employee_id TO decider_id;

ALTER TABLE public.travel_approvals ADD COLUMN decider_role_id uuid REFERENCES public.hot_desk_roles(id);
UPDATE public.travel_approvals tr
SET decider_role_id = r.id
FROM public.hot_desk_roles r
WHERE r.name = CASE tr.decider_role WHEN 'Board Member' THEN 'Board' ELSE tr.decider_role END;

ALTER TABLE public.travel_approvals ADD COLUMN decision_id smallint REFERENCES public.approval_decisions(id);
UPDATE public.travel_approvals
SET decision_id = CASE WHEN decision ILIKE '%approved%' THEN 1 ELSE 2 END;
ALTER TABLE public.travel_approvals ALTER COLUMN decision_id SET NOT NULL;

ALTER TABLE public.travel_approvals DROP COLUMN decider_role;
ALTER TABLE public.travel_approvals DROP COLUMN decision;

COMMIT;
