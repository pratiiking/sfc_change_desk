BEGIN;

-- change_request_approvals.approver_id was the one remaining place storing
-- a raw hot_desk_users.id (or an "EMP-"/"S8-" prefixed variant) long-term,
-- unlike audit_logs.actor_id (migration 045) and
-- PreSpendApproval/TravelApproval.deciderId, which already anchor on the
-- permanent employees.emp_id. That's exactly what orphaned 12 rows when
-- migration 048 deleted 6 long-inactive hot_desk_users rows -- those rows'
-- approver identity could no longer be resolved at all. Re-anchoring here
-- closes the gap for good: an employees row is never deleted (only
-- hot_desk_users rows are, on "remove access"), so this can't happen again.

-- Case 1: bare numeric approver_id (hot_desk_users.id still present) -> email -> emp_id.
UPDATE public.change_request_approvals cra
SET approver_id = e.emp_id
FROM public.hot_desk_users u
JOIN public.employees e ON LOWER(e.email) = LOWER(u.email)
WHERE cra.approver_id ~ '^[0-9]+$'
  AND u.id = cra.approver_id::integer
  AND e.emp_id IS NOT NULL;

-- Case 2: "S8-<n>" prefixed, same resolution path as Case 1.
UPDATE public.change_request_approvals cra
SET approver_id = e.emp_id
FROM public.hot_desk_users u
JOIN public.employees e ON LOWER(e.email) = LOWER(u.email)
WHERE cra.approver_id ~ '^S8-[0-9]+$'
  AND u.id = substring(cra.approver_id FROM 4)::integer
  AND e.emp_id IS NOT NULL;

-- Case 3: "EMP-<n>" prefixed -> employees.id (serial PK, a different id
-- space from hot_desk_users.id) -> emp_id.
UPDATE public.change_request_approvals cra
SET approver_id = e.emp_id
FROM public.employees e
WHERE cra.approver_id ~ '^EMP-[0-9]+$'
  AND e.id = substring(cra.approver_id FROM 5)::integer
  AND e.emp_id IS NOT NULL;

-- Case 4: the 6 users deleted by migration 048 -- their hot_desk_users row
-- no longer exists to join through (Cases 1/2 can't reach them), but their
-- employees row is permanent and was looked up by email before deletion.
UPDATE public.change_request_approvals
SET approver_id = 'SFC-0040' WHERE approver_id IN ('17', 'S8-17');   -- vamshikrishna.motru
UPDATE public.change_request_approvals
SET approver_id = 'SFC-0062' WHERE approver_id IN ('14', 'S8-14');   -- aaishwarya.kadam
UPDATE public.change_request_approvals
SET approver_id = 'SFC-0079' WHERE approver_id IN ('15', 'S8-15');   -- ramakrishna.julakanti
UPDATE public.change_request_approvals
SET approver_id = 'SFC-0094' WHERE approver_id IN ('16', 'S8-16');   -- bharath.dhaggupati
UPDATE public.change_request_approvals
SET approver_id = 'SFC-0104' WHERE approver_id IN ('13', 'S8-13');   -- aravind.jaligapu
UPDATE public.change_request_approvals
SET approver_id = 'SFC-0124' WHERE approver_id IN ('19', 'S8-19');   -- aishwarya.garde

ALTER TABLE public.change_request_approvals ALTER COLUMN approver_id DROP NOT NULL;

-- Anything left that isn't a real emp_id (stale UUID-format rows from the
-- long-dropped `identities` system, already unresolvable before this
-- migration ever ran, and any other unrecognized leftover) becomes NULL
-- rather than guessed at.
UPDATE public.change_request_approvals cra
SET approver_id = NULL
WHERE approver_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.emp_id = cra.approver_id);

ALTER TABLE public.change_request_approvals
  ADD CONSTRAINT change_request_approvals_approver_id_fkey
  FOREIGN KEY (approver_id) REFERENCES public.employees(emp_id)
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
