BEGIN;

-- Expand approval_stages to cover every stage value actually used across
-- change_requests/pre_spend_requests/travel_requests (previously it only
-- had the two ledger-specific stages from the approvals child tables), with
-- a properly descriptive name for each -- 'Final Approval' instead of the
-- generic internal code name 'stage_2_review' for what's actually the last
-- approval gate before completion.
INSERT INTO public.approval_stages (id, code, name, sequence) VALUES
  (3, 'draft', 'Draft', 0),
  (4, 'completed', 'Completed', 3),
  (5, 'rejected', 'Rejected', 4)
ON CONFLICT (id) DO NOTHING;
UPDATE public.approval_stages SET name = 'Final Approval' WHERE code = 'stage_2_review';

-- Clean up 26 change_requests rows carrying undocumented legacy values no
-- code anywhere recognizes -- legacy_completed (status=Implemented) and
-- legacy_active (status=Approved) both correspond to the current system's
-- "completed" stage (status Approved/Implemented both live under
-- approval_stage='completed' today).
UPDATE public.change_requests
SET approval_stage = 'completed'
WHERE approval_stage IN ('legacy_active', 'legacy_completed');

-- Real referential integrity: the DB itself now rejects any approval_stage
-- value that isn't a real row in approval_stages. Adding or removing a
-- stage going forward is a data change to approval_stages, not a
-- search-and-replace of hardcoded strings through service code.
ALTER TABLE public.change_requests
  ADD CONSTRAINT change_requests_approval_stage_fkey
    FOREIGN KEY (approval_stage) REFERENCES public.approval_stages(code);

ALTER TABLE public.pre_spend_requests
  ADD CONSTRAINT pre_spend_requests_approval_stage_fkey
    FOREIGN KEY (approval_stage) REFERENCES public.approval_stages(code);

ALTER TABLE public.travel_requests
  ADD CONSTRAINT travel_requests_approval_stage_fkey
    FOREIGN KEY (approval_stage) REFERENCES public.approval_stages(code);

COMMIT;
