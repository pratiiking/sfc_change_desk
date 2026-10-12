BEGIN;

-- Change Request's own Stage-1-override / Stage-2-decide / implement /
-- comment-posting checks all reused a single hardcoded role-ID flag
-- (isAdminOrSuperAdmin, built from these exact 3 role UUIDs) instead of a
-- permission-key lookup -- the one thing this session already converted
-- for Pre-Spend and Travel. Granting this key to exactly the same 3 roles
-- that already pass the hardcoded check keeps behavior identical; only the
-- mechanism changes from code to data, matching migration 044's pattern.
UPDATE public.hot_desk_roles
SET authority = authority || '["changeRequest.decide"]'::jsonb
WHERE id IN (
  '6ec4d686-d45b-4799-9ca5-47df8b129b49', -- Super Admin
  'a121824e-e101-4bb9-8d97-e321434c4741', -- Admin
  '4956462d-8b9d-4cd5-8cbf-427ff031a217'  -- Change Desk Admin
);

COMMIT;
