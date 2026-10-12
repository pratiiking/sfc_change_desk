BEGIN;

-- ChangeRequestApproval was the one approval table still using a hand-typed
-- ENUM ('Pending'/'Approved'/'Rejected'/'Moot') instead of the normalized
-- decision_id -> approval_decisions lookup that pre_spend_approvals and
-- travel_approvals were already migrated onto (migration 039). 'Moot' was
-- declared in the ENUM but never actually written anywhere in the code --
-- confirmed zero rows use it.
--
-- Unlike Pre-Spend/Travel (which only ever create a row once a real
-- decision happens), Change Request pre-seeds one row per eligible Stage-2
-- voter at submission time with 'Pending', and most rows stay Pending
-- forever once another voter decides first -- so 'Pending' needs to exist
-- in the shared lookup table too. Pre-Spend/Travel never reference it.
INSERT INTO public.approval_decisions (id, code) VALUES (3, 'Pending');

ALTER TABLE public.change_request_approvals ADD COLUMN decision_id smallint REFERENCES public.approval_decisions(id);

UPDATE public.change_request_approvals
SET decision_id = CASE decision
  WHEN 'Approved' THEN 1
  WHEN 'Rejected' THEN 2
  ELSE 3 -- 'Pending' and any stray/unused 'Moot' row both fall back to Pending
END;

ALTER TABLE public.change_request_approvals ALTER COLUMN decision_id SET NOT NULL;

-- idx_cra_approver_request_decision indexes the old `decision` column
-- directly, so it has to go before the column can be dropped; recreate the
-- same shape on decision_id right after.
DROP INDEX IF EXISTS public.idx_cra_approver_request_decision;

ALTER TABLE public.change_request_approvals DROP COLUMN decision;

-- NOT dropping the enum type itself: a separate test_isolated_sandbox
-- schema has its own copy of this table still using it. Leaving an unused
-- type behind in public is harmless.

CREATE INDEX idx_cra_approver_request_decision
  ON public.change_request_approvals (approver_id, change_request_id, decision_id);

CREATE INDEX idx_cra_request_decision
  ON public.change_request_approvals (change_request_id, decision_id);

COMMIT;
