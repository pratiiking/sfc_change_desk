# Architecture

This doc covers system design decisions and current state as of the `hot_desk_users`/role-hierarchy
work (migrations 013–026). For setup/run instructions and repo layout, see the root `README.md`.
For a narrative walkthrough of how the system got here and open gaps, see `KT_Guide.md`.

## 1. Identity & role model

### Tables

| Table | Purpose |
|---|---|
| `employees` | The HR/employee directory. **Gate** for all access: if you're not here, or you've left (`left_at`/`left_reason`/`left_by` set), you can't log in at all, regardless of any role. Shared with other internal Saint Fox systems — this app doesn't own it. |
| `hot_desk_users` | **The single user/role table for this app.** One row per person with an elevated role (anything above Requester). Columns: `id` (serial int, PK), `email`, `first_name`, `last_name`, `microsoft_id`, `last_login`, `role_id` (FK → `hot_desk_roles.id`), `status` (Active/Inactive), `designation`, `invited_by`. |
| `hot_desk_roles` | The 9 roles. `id` (uuid, PK), `name`, `description`, `permissions` (jsonb array of display strings — see §4, this is **not enforced**), `rank` (int, lower = more authority — see §3). |
| `changedesk_identity_roles` (`UserAppRole` model) | A separate, older role-assignment table used specifically for computing Change-Request **voters/approvers** (`getVotersForCategory` in `changeRequest.service.js`). Not the same mechanism as `hot_desk_users.role_id` — see §5. |
| `category_role_assignments` (`ChangeManagerCategory`/`ChangeImplementerCategory` models) | Many-to-many: which catalog categories a given `hot_desk_users.id` is a Change Manager/Implementer for. `user_id` is a real FK → `hot_desk_users.id` (migration 024). |
| `identities` / `identity_aliases` | **Dead.** Built in an earlier phase as an attempted canonical identity layer, populated once by a one-time backfill script (`scripts/backfillIdentities.js`), never kept in sync since. Nothing in live code reads from it. FK constraints that used to point at it were dropped in migration 022 because they were silently rejecting valid writes for anyone added after the backfill ran. Candidate for a future full removal if nothing surfaces a need for it. |

### Why `hot_desk_users` and not a dedicated `change_user` table

There used to be a separate `change_user` table that was the real source of truth for this app, while
`hot_desk_users` was a thin table for a different, now-retired system (SSO login tracking —
`microsoft_id`/`last_login` are its leftover fingerprints). The two tables could independently hold
different roles for the same real person, which was a live, confusing bug (someone could be
"Super Admin" in one table and "Pre-Spend Admin" in the other, and whichever table a given code path
queried silently decided what they could do).

`change_user` was fully merged into `hot_desk_users` and dropped (migration 023). `hot_desk_users` is
now unambiguously the single source of truth for "what can this person do in ChangeDesk."

**Rule going forward:** a person with no `hot_desk_users` row and no category assignment is an implicit
plain Requester (resolved via the `employees` directory fallback in `IdentityResolver`). A
`hot_desk_users` row only needs to exist for someone with a role *above* Requester. Demoting someone to
Requester deletes their row rather than leaving a `role_id = Requester` row sitting around.

### Resolution flow (`services/identityResolver.service.js`)

`IdentityResolver.resolveByEmail(email)` / `resolveByKey(key)` is the **single function every
permission check in the app goes through** — not just at login. `middlewares/auth.middleware.js`'s
`authenticateUser` calls `resolveByKey` on *every authenticated request* (the JWT only carries
`sub`/`email`/`identityType`, never the role — role is always re-resolved live). Keep this in mind
before assuming you can add a "login-only" check without affecting everything else.

```
resolveByEmail(email)
  → employees gate (not found / left company → blocked)
  → hot_desk_users lookup by email
      found + Active  → full identity DTO (role, isSuperAdmin/isChangeManager/etc flags,
                         cmCategories/ciCategories from category_role_assignments)
      found + Inactive → falls through to the bare Requester branch below
      not found        → bare EMPLOYEE_DIRECTORY identity: roleId='role-employee' (code-only
                          sentinel, never stored), all isXxx flags false, Requester-equivalent
```

30-second in-memory cache (`IdentityResolver.keyCache`) — call `IdentityResolver.clearCache()` after
any role mutation.

## 2. Role hierarchy (`hot_desk_roles.rank`)

```
1  Super Admin        — bypasses every per-module check, full access everywhere
2  Board               — full access to Change Request + Pre-Spend + Travel (read/approve), not an admin
3  Admin               — genuinely distinct from Change Desk Admin; scoped to Change Request module only
4  Change Desk Admin, Pre-Spend Admin, Travel Desk Admin  — one module each, same rank (siblings)
5  Change Manager      — Change Request module, Stage-2 approver, scoped to assigned categories
6  Change Implementer  — Change Request module, post-approval implementer, scoped to assigned categories
7  Requester           — baseline, own requests only
```

**Rank governs who can manage whom**, enforced in `services/userManagement.service.js`:
- `assertCanManage(actorRank, targetRank)` — you can only modify/delete an account whose *current*
  role is strictly below yours. This also blocks acting on your own account (your rank is never below
  your own).
- `assertCanGrant(actorRank, newRoleRank)` — you can only *assign* a role strictly below your own rank.
  A Super Admin's ceiling is Board; they can never create another Super Admin (not even by accident).

Rank is read live from `hot_desk_roles.rank` (30s TTL cache in `userManagement.service.js`), not a
hardcoded JS map — this was a deliberate choice after the original design hardcoded it and immediately
needed revising twice in one session.

**Resolved:** `/settings/users*` and the category-assignment routes are gated by the
`settings.users.manage` permission (see §4), granted to ranks 1-4 (Super Admin, Board, Admin, and the
three module admins) — not Super-Admin-only anymore. Change Manager/Implementer/Requester (ranks 5-7)
remain excluded. The rank-based `assertCanManage`/`assertCanGrant` guards described above are what
actually restrict what each tier can do once inside (e.g. Board still can't touch a Super Admin) — the
route-level permission just controls who can reach the screen at all.

### Module access is a *separate* system from rank

Rank governs *who can manage user accounts*. It does **not** govern *which of the three business
modules* (Change Request / Pre-Spend / Travel) someone can use — that's a parallel set of hardcoded
checks: `getAllowedWorklistModules` in `frontend/src/lib/permissions.lib.js`, and
`isPreSpendAdmin`/`isTravelAdmin`/etc. flags computed in `IdentityResolver._buildIdentityDTO` and
re-checked in each module's own service (`preSpend.service.js`, `travelDesk.service.js`). A role being
senior in rank does not automatically grant it module access — e.g. Admin (rank 3) only has Change
Request module access, not Pre-Spend or Travel, despite outranking the Pre-Spend/Travel admins (rank
4). This split surprised everyone who touched it; don't assume rank implies module reach.

## 3. Approval workflow (Change Request, and mirrored in Pre-Spend/Travel)

Two-stage: `manager_review` → `stage_2_review` → `completed`/`rejected`. Shared state-machine logic
lives in `config/approvalWorkflow.js` (consolidated code-side, not schema-side, from three
near-duplicate implementations — no DB change, just shared functions).

- **Stage 1**: the manager named on the request form (free text, not necessarily a `hot_desk_users`
  account) approves/rejects via a signed-JWT email link.
- **Stage 2**: Change Manager(s) assigned to the request's category (via `category_role_assignments`),
  or Super Admin/Change Desk Admin as a fallback if no Change Manager is assigned to that category.
- **Post-approval**: Change Implementer(s) assigned to the category mark it implemented.

Emails for each transition are built fresh from the live request row at *send* time
(`notificationQueue.service.js`), not pre-rendered and stored — `notification_jobs` only carries enough
to re-fetch the row and pick the right template, specifically so a delayed retry can't send stale
content.

`change_request_approvals` is a real per-approver audit ledger (one row per eligible approver per
request, `Pending`/`Approved`/`Rejected`/`Moot`) — distinct from `category_role_assignments`, which is
the static "who's eligible for this category" assignment, not a per-request record.

Pre-Spend and Travel use a different pattern for the same concept: `approval_history` (a JSONB array on
the request row itself) instead of a normalized child table. This inconsistency across the three
modules is known and unresolved — normalizing Pre-Spend/Travel onto the same `*_approvals` child-table
pattern as Change Request would be the "proper" fix, but is a real migration, not a quick change.

## 4. `hot_desk_roles.permissions` — real on the backend, not yet on the frontend

**Backend (the actual security boundary): real, enforced.** `hot_desk_roles.permissions` is now a
JSONB array of namespaced permission keys (`settings.users.manage`, `changeRequest.worklist.view`,
`dashboard.export`, `dashboard.org.view`, `preSpend.worklist.view`, `travel.worklist.view`,
`settings.roles.manage`, `settings.auditLogs.view`, `catalog.subcategory.manage`). Every backend route
guard (`middlewares/auth.middleware.js`'s `requirePermission(key)`, used across all 9
`routes/*.routes.js` files) checks this array — resolved fresh onto `req.user.permissions` by
`IdentityResolver` on every request — instead of a hardcoded role-ID list. Editing a role's permissions
via Settings → Roles now genuinely changes what that role's accounts can do. Super Admin still bypasses
everything via `req.user.isSuperAdmin`, same as before.

Current key → role assignment reproduces exactly the access each role had before this change (see
migration 027) — this was a faithfulness pass, not an access-expansion. The still-open item from §2
(Settings being Super-Admin-only despite rank supporting more tiers) remains open; the route guards
are now DB-driven, but nobody's `permissions` array yet includes `settings.users.manage` except Super
Admin.

**Frontend: still the old hardcoded layer, not yet converted.** `getAllowedWorklistModules` in
`permissions.lib.js` and the various `isXxx`/`roleId === ROLE.X` checks scattered through page
components are UI-only (which tabs/buttons render) — the backend route guards above are what actually
enforce access regardless of what the frontend shows. Converting the frontend to also read from
`permissions` (via `req.user.permissions`, already propagated through `publicUser()`) would make the UI
consistent with the backend (not showing a tab the backend will reject) but is not a security fix —
it's a UX one, deliberately left for a follow-up pass.

Backend service-level flags (`isSuperAdmin`/`isChangeManager`/etc. computed in
`IdentityResolver._buildIdentityDTO`) were intentionally left as role-ID checks rather than converted
to permission checks — they encode identity ("is this person a Change Manager," used for category
scoping and business logic throughout the approval workflow), which is a different concept from route
authorization ("can this request reach this endpoint"). Only the latter was converted.

## 5. Two historical role-assignment mechanisms still coexist

`hot_desk_users.role_id` (what this doc has mostly been about) and `changedesk_identity_roles`
(`UserAppRole` model, used only by `getVotersForCategory`/`getApproverEmails` for computing who gets
CC'd as a Stage-2 Change Request voter) are **not the same system** and were never unified. The latter
predates the `hot_desk_users` consolidation and still stores its own `user_key` values independently.
It works today (verified live), but it's a second, parallel place role-like data lives, worth knowing
about before assuming "all roles live in `hot_desk_users`."

## 6. Normalization choices worth knowing about

- `change_requests.custom_field_values` (and the Pre-Spend/Travel equivalents) is an intentional
  EAV-style JSONB blob for dynamic, catalog-driven form fields (`catalog_subcategory_fields` defines
  what fields exist per subcategory/action) — not something to "fix" into columns, the dynamism is the
  point.
- A handful of fields are deliberately promoted out of that blob into real columns on the request row
  (`employeeName`, `fromLocation`/`toLocation`, etc.) purely for SQL search/sort/list-display without
  parsing JSON on every row. `travel_requests.booking_details` had a bug where several of these were
  being *duplicated* into both the column and the blob (fixed — the blob now only holds genuinely
  unique-per-mode fields, the canonical columns are the single source for anything promoted).
