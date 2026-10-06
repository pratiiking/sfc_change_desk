BEGIN;

-- Replace the decorative permission labels with real, enforceable permission
-- keys. These are chosen to reproduce EXACTLY the access each role already
-- has today (derived from the hardcoded requireRole()/requireWorklistViewRole()
-- arrays this migration's matching code change replaces) — this pass makes
-- permissions.jsonb the actual source of truth without changing who can do
-- what. Expanding access (e.g. letting Board/Admin reach Settings) is a
-- separate, deliberate follow-up once this is verified.

UPDATE public.hot_desk_roles SET permissions = '[
  "catalog.subcategory.manage",
  "dashboard.export",
  "dashboard.org.view",
  "settings.users.manage",
  "settings.roles.manage",
  "settings.auditLogs.view",
  "changeRequest.worklist.view",
  "preSpend.worklist.view",
  "travel.worklist.view"
]'::jsonb
WHERE id = '6ec4d686-d45b-4799-9ca5-47df8b129b49'; -- Super Admin (also hard bypasses everything regardless)

UPDATE public.hot_desk_roles SET permissions = '[
  "dashboard.export",
  "dashboard.org.view",
  "preSpend.worklist.view",
  "travel.worklist.view"
]'::jsonb
WHERE id = '3417e445-d172-4c97-ab04-e10b8b87b3ce'; -- Board

UPDATE public.hot_desk_roles SET permissions = '[
  "changeRequest.worklist.view",
  "preSpend.worklist.view",
  "travel.worklist.view"
]'::jsonb
WHERE id = 'a121824e-e101-4bb9-8d97-e321434c4741'; -- Admin

UPDATE public.hot_desk_roles SET permissions = '[
  "changeRequest.worklist.view"
]'::jsonb
WHERE id = '4956462d-8b9d-4cd5-8cbf-427ff031a217'; -- Change Desk Admin

UPDATE public.hot_desk_roles SET permissions = '[
  "preSpend.worklist.view"
]'::jsonb
WHERE id = '2e4b2955-17f3-40dd-8a57-0584345c5334'; -- Pre-Spend Admin

UPDATE public.hot_desk_roles SET permissions = '[
  "travel.worklist.view"
]'::jsonb
WHERE id = 'ce1292e3-6159-40e9-acd5-97b760881d73'; -- Travel Desk Admin

UPDATE public.hot_desk_roles SET permissions = '[
  "changeRequest.worklist.view"
]'::jsonb
WHERE id = '77b8ffd1-61cb-4b95-9269-6dcac2f7781a'; -- Change Manager

UPDATE public.hot_desk_roles SET permissions = '[
  "changeRequest.worklist.view"
]'::jsonb
WHERE id = 'e4039e02-9139-4e9e-8e9d-28ae2338116d'; -- Change Implementer

UPDATE public.hot_desk_roles SET permissions = '[]'::jsonb
WHERE id = '0af92e2d-5a2f-4568-8c65-505bec4535f2'; -- Requester (baseline, no route-level gates below)

COMMIT;
