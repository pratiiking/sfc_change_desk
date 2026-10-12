BEGIN;

-- hot_desk_audit_logs.actor_id was a free-text VARCHAR holding one of:
--   - a bare hot_desk_users.id ("10")              -- privileged actors
--   - "EMP-<employees.id>"                          -- plain-employee actors (no hot_desk_users row)
--   - "SYSTEM"                                      -- automated entries
-- Any reader had to know which format it was in and go resolve it by hand,
-- and if hot_desk_users.id's type ever changed, every row referencing it
-- would be stale. Re-anchor the same column on employees.emp_id instead --
-- every actor, privileged or not, is resolvable to a real employee (a
-- hot_desk_users account cannot exist without a matching employees row), so
-- it's the one value that covers every case with no branching, matching the
-- pattern already used by PreSpendApproval.deciderId / TravelApproval.deciderId.

-- Backfill case 1: bare numeric actor_id -> hot_desk_users.id -> email -> employees.emp_id
UPDATE public.hot_desk_audit_logs al
SET actor_id = e.emp_id
FROM public.hot_desk_users u
JOIN public.employees e ON LOWER(e.email) = LOWER(u.email)
WHERE al.actor_id ~ '^[0-9]+$'
  AND u.id = al.actor_id::integer
  AND e.emp_id IS NOT NULL;

-- Backfill case 2: "EMP-<employees.id>" -> employees.id (serial PK) -> employees.emp_id
UPDATE public.hot_desk_audit_logs al
SET actor_id = e.emp_id
FROM public.employees e
WHERE al.actor_id ~ '^EMP-[0-9]+$'
  AND e.id = substring(al.actor_id FROM 5)::integer
  AND e.emp_id IS NOT NULL;

-- Safety net: "SYSTEM" and anything that still isn't a real emp_id (orphaned
-- id, already-deleted hot_desk_users row, etc.) becomes NULL rather than
-- guessed at or left to violate the new FK. The raw old value is not
-- recoverable after this, but every audit entry's `detail` text already
-- bakes the actor's name/email in as plain text at write time, so nothing
-- about the audit trail's readability is lost.
UPDATE public.hot_desk_audit_logs al
SET actor_id = NULL
WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.emp_id = al.actor_id);

ALTER TABLE public.hot_desk_audit_logs
  ALTER COLUMN actor_id DROP NOT NULL;

ALTER TABLE public.hot_desk_audit_logs
  ADD CONSTRAINT hot_desk_audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.employees(emp_id)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_hot_desk_audit_logs_actor_id
  ON public.hot_desk_audit_logs (actor_id);

COMMIT;
