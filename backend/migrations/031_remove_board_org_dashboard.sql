BEGIN;

-- Org Dashboard is restricted to Admin and Super Admin only; Board should not see it.
UPDATE public.hot_desk_roles
SET permissions = permissions - 'dashboard.org.view'
WHERE id = '3417e445-d172-4c97-ab04-e10b8b87b3ce' -- Board
  AND permissions @> '["dashboard.org.view"]'::jsonb;

COMMIT;
