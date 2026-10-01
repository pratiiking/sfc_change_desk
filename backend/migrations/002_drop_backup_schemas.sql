-- ==============================================================================
-- Migration: 002_drop_backup_schemas.sql
-- Description: Drops the two leftover snapshot schemas created during the
--              000/001 production cleanup. They are not referenced by the
--              application (Sequelize only ever touches `public`) and exist
--              only as a one-time safety net for that migration.
-- Safety Guarantee: Does not touch anything in the `public` schema.
-- ==============================================================================

BEGIN;

DROP SCHEMA IF EXISTS backup_public_baseline CASCADE;
DROP SCHEMA IF EXISTS backup_public_pre_cleanup CASCADE;

COMMIT;
