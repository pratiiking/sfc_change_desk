BEGIN;

-- Granular "can decide this stage" permission keys, replacing the scattered
-- isSuperAdmin/isBoardUser/isAdmin/isTravelAdmin OR-chains that were
-- re-derived from role IDs/names at every call site. Adding or removing a
-- role's authority to decide a stage is now a data change to this column,
-- not a code change -- same spirit as approval_stages/approval_decisions.
--
-- Row-level checks (is this the named reporting manager on THIS request,
-- is this your own request) are NOT permissions and stay as per-row checks
-- in code -- a permission can only describe what a ROLE can do in general,
-- never a relationship between a specific user and a specific row.

-- Pre-Spend: Super Admin and Admin can decide both stages. Board can only
-- decide Stage 2 (never names reporting managers). Pre-Spend Admin gets
-- neither -- it stays view-only at Stage 2, unchanged from today.
UPDATE public.hot_desk_roles
SET authority = authority || '["preSpend.stage1.decide", "preSpend.stage2.decide"]'::jsonb
WHERE id IN ('6ec4d686-d45b-4799-9ca5-47df8b129b49', 'a121824e-e101-4bb9-8d97-e321434c4741'); -- Super Admin, Admin

UPDATE public.hot_desk_roles
SET authority = authority || '["preSpend.stage2.decide"]'::jsonb
WHERE id = '3417e445-d172-4c97-ab04-e10b8b87b3ce'; -- Board

-- Travel: Super Admin, Admin, and Board can decide both stages, short-notice
-- included. Travel Desk Admin can only decide standard (non-short-notice)
-- Stage 2 -- short-notice/premium bookings stay Board-tier only.
UPDATE public.hot_desk_roles
SET authority = authority || '["travel.stage1.decide", "travel.stage2.decide.standard", "travel.stage2.decide.shortNotice"]'::jsonb
WHERE id IN ('6ec4d686-d45b-4799-9ca5-47df8b129b49', 'a121824e-e101-4bb9-8d97-e321434c4741'); -- Super Admin, Admin

UPDATE public.hot_desk_roles
SET authority = authority || '["travel.stage2.decide.standard", "travel.stage2.decide.shortNotice"]'::jsonb
WHERE id = '3417e445-d172-4c97-ab04-e10b8b87b3ce'; -- Board

UPDATE public.hot_desk_roles
SET authority = authority || '["travel.stage2.decide.standard"]'::jsonb
WHERE id = 'ce1292e3-6159-40e9-acd5-97b760881d73'; -- Travel Desk Admin

COMMIT;
