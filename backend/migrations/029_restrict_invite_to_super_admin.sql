BEGIN;

-- Inviting/creating new users becomes its own, narrower permission — only
-- Super Admin can do it. Ranks 2-4 keep settings.users.manage (view existing
-- users, edit their role, deactivate them) but lose the ability to create new
-- accounts. settings.auditLogs.view was already Super Admin-only (unchanged
-- here) — this migration exists purely for the invite-permission split.

UPDATE public.hot_desk_roles SET permissions = permissions || '["settings.users.invite"]'::jsonb
WHERE id = '6ec4d686-d45b-4799-9ca5-47df8b129b49'; -- Super Admin

COMMIT;
