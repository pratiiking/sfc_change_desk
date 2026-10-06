# Changelog

Chronological record of schema migrations and the architectural decisions behind them. Each entry
references the migration file(s) in `backend/migrations/` for the exact SQL. For current-state design,
see `architecture.md`; for practical gotchas arising from these changes, see `KT_Guide.md`.

## Identity consolidation

- **011** — `identities.employee_id` FK retargeted from `employees.id` to `employees.emp_id`.
- **012** — `users` table renamed to `hot_desk_users`, to disambiguate from this app's own identity
  system once it became clear the two were easy to confuse.
- **013** — `roles.id` converted from a human-readable slug (`role-1`, `role-2-change`, ...) to a real
  UUID primary key. Required a full rewrite of ~216 hardcoded role-slug literal comparisons across 28
  backend and frontend files, consolidated behind a single `ROLE` constants object
  (`config/constants.js` backend, `lib/permissions.lib.js` frontend — must stay byte-identical).
- **014** — `hot_desk_users.role` (free-text varchar) mapped to a real `role_id` FK. All existing rows
  defaulted to Admin except two people manually confirmed as Super Admin.
- **015** — `audit_logs` → `hot_desk_audit_logs`; dropped `hot_desk_users.role` (superseded by
  `role_id`).
- **016** — `hot_desk_users.given_name`/`family_name` → `first_name`/`last_name`; dropped
  `display_name` (never read anywhere — nothing concatenated first/last name into a stored display
  name, so there was nothing to preserve).
- **017** — Dropped `hot_desk_users.login_type` (unused, constant value across every row).
- **021** — `roles` table renamed to `hot_desk_roles`.
- **022** — Dropped 7 FK constraints pointing at the `identities` table (`change_requests`,
  `change_request_approvals`, `pre_spend_requests`, `travel_requests`, `hot_desk_audit_logs`,
  `category_role_assignments`'s `requester_id`/`approver_id`/`actor_id`/`user_id` columns).
  `identities` was never kept in sync after a one-time backfill script, so these constraints had begun
  silently rejecting legitimate writes for anyone added since. This was discovered as a live bug
  (Change Request submission failing with an FK violation) and fixed the same day.
- **023** — **`change_user` table dropped**, fully merged into `hot_desk_users` as the single user/role
  table. Added `status`/`designation`/`invited_by` columns to `hot_desk_users` for parity with what
  `change_user` had. Remapped the 3 real, still-matched `category_role_assignments` rows to
  `hot_desk_users.id`; deleted 29 already-orphaned rows that predated this and had never resolved to
  anything live. `IdentityResolver` and the entire Settings "Manage Users" backend
  (`userManagement.service.js`) rewritten to read/write `hot_desk_users` instead.
- **024** — `category_role_assignments.user_id` converted from varchar (holding stringified IDs with
  `EMP-`/`S8-` alias prefixes) to a real integer FK → `hot_desk_users.id`. Let the EMP-/S8- alias
  normalization logic in 4 service functions be deleted — there's only one real ID format now.

## Role hierarchy

- **025** — Added `hot_desk_roles.rank` (lower = more authority), to enforce that a user can only
  create/modify/delete accounts — and only *grant* roles — strictly below their own rank. Built as a
  real DB column rather than a hardcoded JS map specifically so it can't drift the way the role-name
  maps already had (see "Fixed bugs" below).
- **026** — Revised rank ordering: Admin promoted above the three module admins (was previously the
  same rank as Change Desk Admin), Change Manager promoted above Change Implementer (was previously
  the same rank). Pure data change, took effect immediately with no code touched.

## Dead weight removed

- **018** — `app_config` table dropped. Of its 4 keys, only `cr_approval_comments` was real (and that
  data already lived natively in `change_requests.custom_field_values` — the read path was switched to
  read from there directly). `dashboard_stats`/`worklist_metrics`/`report_metrics` were write-only or
  fully orphaned, never actually consumed by the frontend.
- **019** — Dropped `hot_desk_users.is_active` (never read) and `change_requests.active_step` (always
  hardcoded to `1`, never read with any other value). Also removed a dead, broken
  `GET /catalog/categories/:id/subcategories` route — broken because it selected columns
  (`sla`/`description`) that no longer existed on `catalog_subcategories`, and dead because the
  frontend only ever consumed subcategories nested inside the categories response, never this endpoint.
- **020** — Dropped `notification_jobs.payload`. It stored the fully pre-rendered email HTML at enqueue
  time; switched to rendering from the live request row at send time instead (the worker already
  re-fetches that row anyway, for stage/cycle eligibility checks), removing the need to freeze and
  store the rendered content at all.

## Fixed bugs

- **`travel_requests.booking_details` double-storage.** Canonical columns (`fromLocation`,
  `travelClass`, etc.) were extracted from the raw submitted form at creation time, but the raw form
  was *also* kept in full inside `booking_details` for every mode except multi-city flights — so the
  same value was persisted twice under two different labels. Generalized the existing
  multi-city-only stripping logic to run for every travel mode.
- **`ROLE_LOOKUP_MAP['admin']` silently coercing "Admin" into "Change Desk Admin."** Leftover from
  when the two were the same role; `normalizeRole()` was rewriting every attempt to set someone's role
  to "Admin" back into `CHANGE_ADMIN` before saving, so the update API reported success while silently
  not changing anything. Fixed alongside the equivalent `ROLE_ID_TO_NAME`/`APP_ROLE_MAP`/legacy
  `'role-2'` slug entries that had the identical problem.
