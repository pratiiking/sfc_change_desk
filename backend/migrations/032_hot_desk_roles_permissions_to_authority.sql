BEGIN;

-- "permissions" implied a role needs permission to act; a role IS the grant
-- of authority for the actions it lists. Rename to reflect that.
ALTER TABLE public.hot_desk_roles RENAME COLUMN permissions TO authority;

COMMIT;
