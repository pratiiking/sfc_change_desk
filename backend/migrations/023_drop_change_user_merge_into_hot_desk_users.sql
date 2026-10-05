BEGIN;

-- hot_desk_users becomes the single user/role table. Add the columns
-- change_user had that are still genuinely needed: status (app-level
-- deactivation, independent of employees.left_at), designation, invited_by.
ALTER TABLE public.hot_desk_users ADD COLUMN status character varying DEFAULT 'Active';
ALTER TABLE public.hot_desk_users ADD COLUMN designation character varying;
ALTER TABLE public.hot_desk_users ADD COLUMN invited_by character varying;

-- Neel Kanani is Requester-primary in change_user but holds category-scoped
-- Change Manager assignments (category_role_assignments) — give him a
-- hot_desk_users row so that access survives the cutover, consistent with
-- how the rest of the app already treats "has cmCategories" as equivalent
-- to holding the Change Manager role.
INSERT INTO public.hot_desk_users (email, first_name, last_name, role_id, status, created_at, updated_at)
VALUES ('neel.kanani@stfox.com', 'Neel', 'Kanani', '77b8ffd1-61cb-4b95-9269-6dcac2f7781a', 'Active', now(), now());

-- Remap the 3 real, currently-matched category_role_assignments rows from
-- change_user.id to the corresponding hot_desk_users.id.
UPDATE public.category_role_assignments SET user_id = (SELECT id::text FROM public.hot_desk_users WHERE lower(email) = 'neel.kanani@stfox.com')
  WHERE user_id = '11';
UPDATE public.category_role_assignments SET user_id = (SELECT id::text FROM public.hot_desk_users WHERE lower(email) = 'ashish.chikane@stfox.com')
  WHERE user_id = '60d82fbe-a9ad-4b19-846f-4d97ca7fe4fc';
UPDATE public.category_role_assignments SET user_id = (SELECT id::text FROM public.hot_desk_users WHERE lower(email) = 'gautam.shah@stfox.com')
  WHERE user_id = '7ecd922d-e68b-414e-a7d2-7dafce3275a6';

-- The remaining category_role_assignments rows (EMP-* prefixed ids, and a
-- couple of stray UUIDs) never matched any change_user row and were already
-- unreachable dead data: IdentityResolver's EMPLOYEE_DIRECTORY fallback path
-- (for anyone without a change_user/hot_desk_users row) has always
-- hardcoded cmCategories/ciCategories to empty, so these never granted
-- anyone real access. Remove them now that they can't even coincidentally
-- resolve to a hot_desk_users id.
DELETE FROM public.category_role_assignments
  WHERE user_id NOT IN (SELECT id::text FROM public.hot_desk_users);

ALTER TABLE public.identities DROP CONSTRAINT IF EXISTS identities_change_user_id_fkey;

DROP TABLE public.change_user;

COMMIT;
