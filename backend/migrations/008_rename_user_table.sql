-- ==============================================================================
-- Migration: 008_rename_user_table.sql
-- Description: Table naming across the schema was inconsistent (`user`
--              singular vs. `roles`/`employees`/`change_user` elsewhere) and
--              `user` is a reserved word, forcing every raw query that
--              touches it to double-quote it. Renames to `users`. Verified
--              no raw SQL anywhere in the codebase references "user"
--              directly (Sequelize abstracts the table name via UserS8's
--              `tableName` option, updated alongside this migration).
-- Safety Guarantee: Pure rename, no data or column changes.
-- ==============================================================================

BEGIN;

ALTER TABLE public."user" RENAME TO users;

COMMIT;
