BEGIN;

-- Lower rank = higher authority. Used to enforce that a user can only
-- create/modify/delete accounts strictly below their own rank, and can never
-- grant a role at or above their own rank (including to themselves).
ALTER TABLE public.hot_desk_roles ADD COLUMN rank integer;

UPDATE public.hot_desk_roles SET rank = 1 WHERE id = '6ec4d686-d45b-4799-9ca5-47df8b129b49'; -- Super Admin
UPDATE public.hot_desk_roles SET rank = 2 WHERE id = '3417e445-d172-4c97-ab04-e10b8b87b3ce'; -- Board
UPDATE public.hot_desk_roles SET rank = 3 WHERE id = 'a121824e-e101-4bb9-8d97-e321434c4741'; -- Admin
UPDATE public.hot_desk_roles SET rank = 3 WHERE id = '4956462d-8b9d-4cd5-8cbf-427ff031a217'; -- Change Desk Admin
UPDATE public.hot_desk_roles SET rank = 3 WHERE id = '2e4b2955-17f3-40dd-8a57-0584345c5334'; -- Pre-Spend Admin
UPDATE public.hot_desk_roles SET rank = 3 WHERE id = 'ce1292e3-6159-40e9-acd5-97b760881d73'; -- Travel Desk Admin
UPDATE public.hot_desk_roles SET rank = 4 WHERE id = '77b8ffd1-61cb-4b95-9269-6dcac2f7781a'; -- Change Manager
UPDATE public.hot_desk_roles SET rank = 4 WHERE id = 'e4039e02-9139-4e9e-8e9d-28ae2338116d'; -- Change Implementer
UPDATE public.hot_desk_roles SET rank = 5 WHERE id = '0af92e2d-5a2f-4568-8c65-505bec4535f2'; -- Requester

ALTER TABLE public.hot_desk_roles ALTER COLUMN rank SET NOT NULL;

COMMIT;
