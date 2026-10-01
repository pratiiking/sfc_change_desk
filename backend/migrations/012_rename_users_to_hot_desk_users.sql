-- ==============================================================================
-- Migration: 012_rename_users_to_hot_desk_users.sql
-- Description: Renames `users` (the Microsoft SSO login cache, formerly
--              `user`) to `hot_desk_users`. Verified no raw SQL anywhere
--              references "users" directly; UserS8.js's tableName updated
--              to match.
-- Safety Guarantee: Pure rename, no data or column changes.
-- ==============================================================================

BEGIN;

ALTER TABLE public.users RENAME TO hot_desk_users;

COMMIT;
