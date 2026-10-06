BEGIN;

-- Admin (rank 3) can now also see the Organization Dashboard, alongside
-- Super Admin and Board.
UPDATE public.hot_desk_roles SET permissions = permissions || '["dashboard.org.view"]'::jsonb
WHERE id = 'a121824e-e101-4bb9-8d97-e321434c4741' -- Admin
  AND NOT (permissions @> '["dashboard.org.view"]'::jsonb);

COMMIT;
