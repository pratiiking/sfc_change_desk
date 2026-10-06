BEGIN;

-- Rebuild permissions to actually match each role's own description text,
-- and per explicit instruction: ranks 1-4 (Super Admin, Board, Admin, and
-- the three module admins) can reach the user-management screen.
--
-- Split settings.roles.manage (editing what a role itself can do — stays
-- Super Admin only, it's a more sensitive, system-wide capability than
-- assigning an existing role to a person) from the new settings.roles.view
-- (read-only list, needed by ranks 1-4 just to populate the role picker in
-- the Users screen).

UPDATE public.hot_desk_roles SET permissions = '[
  "catalog.subcategory.manage",
  "dashboard.export",
  "dashboard.org.view",
  "settings.users.manage",
  "settings.roles.view",
  "settings.roles.manage",
  "settings.auditLogs.view",
  "changeRequest.worklist.view",
  "preSpend.worklist.view",
  "travel.worklist.view"
]'::jsonb
WHERE id = '6ec4d686-d45b-4799-9ca5-47df8b129b49'; -- Super Admin — "database & user management", full control

UPDATE public.hot_desk_roles SET permissions = '[
  "dashboard.export",
  "dashboard.org.view",
  "settings.users.manage",
  "settings.roles.view",
  "preSpend.worklist.view",
  "travel.worklist.view"
]'::jsonb
WHERE id = '3417e445-d172-4c97-ab04-e10b8b87b3ce'; -- Board — "executive oversight" + rank-2 user management

UPDATE public.hot_desk_roles SET permissions = '[
  "dashboard.export",
  "settings.users.manage",
  "settings.roles.view",
  "changeRequest.worklist.view",
  "preSpend.worklist.view",
  "travel.worklist.view"
]'::jsonb
WHERE id = 'a121824e-e101-4bb9-8d97-e321434c4741'; -- Admin — "user onboarding, and system reporting"

UPDATE public.hot_desk_roles SET permissions = '[
  "dashboard.export",
  "settings.users.manage",
  "settings.roles.view",
  "changeRequest.worklist.view"
]'::jsonb
WHERE id = '4956462d-8b9d-4cd5-8cbf-427ff031a217'; -- Change Desk Admin — "Export Reports" + "Manage Change Desk Users"

UPDATE public.hot_desk_roles SET permissions = '[
  "dashboard.export",
  "settings.users.manage",
  "settings.roles.view",
  "preSpend.worklist.view"
]'::jsonb
WHERE id = '2e4b2955-17f3-40dd-8a57-0584345c5334'; -- Pre-Spend Admin — "Export Pre-Spend Reports" + "Manage Pre-Spend Users"

UPDATE public.hot_desk_roles SET permissions = '[
  "dashboard.export",
  "settings.users.manage",
  "settings.roles.view",
  "travel.worklist.view"
]'::jsonb
WHERE id = 'ce1292e3-6159-40e9-acd5-97b760881d73'; -- Travel Desk Admin — "Export Travel Reports" + "Manage Travel Users"

UPDATE public.hot_desk_roles SET permissions = '[
  "changeRequest.worklist.view"
]'::jsonb
WHERE id = '77b8ffd1-61cb-4b95-9269-6dcac2f7781a'; -- Change Manager — rank 5, excluded from Settings

UPDATE public.hot_desk_roles SET permissions = '[
  "changeRequest.worklist.view"
]'::jsonb
WHERE id = 'e4039e02-9139-4e9e-8e9d-28ae2338116d'; -- Change Implementer — rank 6, excluded from Settings

UPDATE public.hot_desk_roles SET permissions = '[]'::jsonb
WHERE id = '0af92e2d-5a2f-4568-8c65-505bec4535f2'; -- Requester — baseline

COMMIT;
