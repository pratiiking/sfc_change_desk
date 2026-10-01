-- ==============================================================================
-- Migration: 003_dedupe_change_user_email_index.sql
-- Description: change_user.email currently has three indexes stacked on it
--              (change_user_email_key, change_user_email_key1 — both UNIQUE
--              constraints — plus a plain index change_user_email). Keeps
--              one unique constraint, drops the redundant two.
-- Safety Guarantee: Does not change any data; change_user_email_key (the
--              first unique constraint) remains, so email uniqueness is
--              still enforced.
-- ==============================================================================

BEGIN;

ALTER TABLE public.change_user DROP CONSTRAINT IF EXISTS change_user_email_key1;
DROP INDEX IF EXISTS public.change_user_email;

COMMIT;
