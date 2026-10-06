# Knowledge Transfer Guide

Practical guide for picking up this codebase. Read `architecture.md` first for the system design;
this doc is the "how do I actually work on this" companion — running it, debugging it, and the
specific gotchas that have already bitten people.

## Running it locally

```bash
npm run install:backend && npm run install:frontend
# copy backend/.env.example -> backend/.env, frontend/.env.example -> frontend/.env, fill in values
npm run server     # backend — PORT in backend/.env (currently 5002, not the historical 5001)
npm run dev         # frontend, from frontend/ — Vite on 5174
```

Migrations are plain numbered SQL files in `backend/migrations/`, run via
`node backend/scripts/runMigrations.js` (tracked in a `schema_migrations` table, transactional,
idempotent — safe to re-run, it skips what's already applied). **Always run migrations against the
real live database** when making schema changes — this project doesn't have a local/seed-only dev DB,
the Supabase instance in `DATABASE_URI` *is* the dev database and is shared with other internal Saint
Fox systems (see `employees`/`UserS8`'s origin in `architecture.md`).

### `.env` gotchas

- `backend/.env`'s `MAIL_ENABLED` and `SMTP_*` being commented out doesn't mean "mail is broken" — it
  means mail silently falls back to **nodemailer's Ethereal sandbox**, a fake SMTP server that accepts
  everything and delivers nothing. The app logs `[mail] SMTP transport ready` in *both* cases (real
  SMTP and Ethereal), so that log line alone doesn't tell you which one is active — check whether
  `SMTP_HOST` is actually uncommented and non-empty.
- `MAIL_ENABLED=false` is checked *before* `SMTP_HOST`, so setting it to `false` skips sending
  entirely (not even Ethereal) — jobs end up `status: 'sent', lastError: 'Skipped: mail-disabled'`.

## Where to look for things

| Question | Look here |
|---|---|
| "Why does this role have this access?" | `hot_desk_roles.rank` for hierarchy, but **module access is separate** — check `permissions.lib.js` (frontend) and the relevant service's `isXxxAdmin` computation, not rank. |
| "Who resolves a user's permissions?" | `services/identityResolver.service.js` — the one function (`resolveByEmail`/`resolveByKey`) everything funnels through, called on every request via `authenticateUser` middleware, not just at login. |
| "Why isn't my role change doing anything?" | Check whether `normalizeRole()`/`ROLE_LOOKUP_MAP` in `config/constants.js` has a stale alias silently rewriting the role you picked (this has happened before — see Gotchas below). Verify directly against the DB, not just the API response, since a "success" response doesn't guarantee the write actually changed anything if normalization swapped it. |
| "Where do Change Request/Pre-Spend/Travel approvers get computed?" | `getApproverEmails`/`getImplementerEmails`/`getBoardMemberEmails`/etc. in `services/userManagement.service.js`, which query `category_role_assignments` + fall back to flat `UserS8.roleId` queries. |
| "Why did a Settings update throw a Postgres error about types?" | Check whether a value being compared against `category_role_assignments.user_id` (now a real integer FK) is being passed as a string or vice versa — Postgres doesn't implicitly cast `varchar = integer`. |

## Gotchas (real bugs hit in this codebase, kept here so they don't recur)

1. **A role name map silently coercing one role into another.** `ROLE_LOOKUP_MAP['admin']` used to
   point at `ROLE.CHANGE_ADMIN` instead of `ROLE.ADMIN_LEGACY` — leftover from when "Admin" and
   "Change Desk Admin" were treated as the same role. Selecting "Admin" in the UI silently saved as
   "Change Desk Admin," with the API still reporting success (because the write succeeded — just with
   the wrong value). **Lesson:** when a role-name constant doesn't do what you expect, check
   `normalizeRole()`'s output directly (`node -e "..."` against the live import), don't trust that a
   "success" API response means the value you intended actually landed. Verify against the DB.

2. **Stale FK constraints silently blocking writes for anyone added after a one-time backfill.** The
   `identities` table was populated once and never kept in sync; FK constraints on `change_requests`,
   `change_request_approvals`, etc. pointing at it started rejecting legitimate inserts the moment a
   new person's ID wasn't in that stale snapshot. If a live feature suddenly throws a Postgres FK
   violation with no code change nearby, check whether the referenced table is actually being kept
   current, not just whether the constraint itself looks right.

3. **Type mismatches after an ID-space migration.** When `category_role_assignments.user_id` moved
   from a `change_user.id` string-UUID space to a `hot_desk_users.id` integer space, several call sites
   still passed raw integers into string comparisons (and vice versa) — Postgres doesn't implicitly
   cast `varchar = integer`. Any time a column's underlying type changes, grep every call site that
   builds a `WHERE ... IN (...)` or equality against it, don't assume Sequelize/JS's looser typing will
   paper over it.

4. **Mail "sent" doesn't mean delivered.** `sendMail()` returns `{sent: true}` for both real SMTP and
   the Ethereal sandbox — a clean `status: 'sent'` row in `notification_jobs` with no error is
   consistent with the recipient never receiving anything. Check `SMTP_HOST` is actually configured
   before trusting that signal.

## Open items (known, deliberately not done yet)

- ~~Settings/"Manage Users" is Super-Admin-only at the route layer~~ — **resolved.** Ranks 1-4 (Super
  Admin, Board, Admin, module admins) now hold `settings.users.manage` and can reach the screen; ranks
  5-7 (Change Manager/Implementer/Requester) cannot. The rank-based `assertCanManage`/`assertCanGrant`
  guards restrict what each tier can actually do once inside — see `architecture.md` §2.
- **`hot_desk_roles.permissions` is real on the backend now, not yet on the frontend** — see
  `architecture.md` §4. Every backend route guard checks it; `permissions.lib.js` and page-level
  `isXxx` checks on the frontend are still the old hardcoded role-ID layer (UX-only — the backend is
  the real boundary, so this isn't a security gap, just an inconsistency between what the UI offers
  and what the backend allows).
- **Pre-Spend/Travel approval history** is a JSONB array on the request row, inconsistent with Change
  Request's normalized `change_request_approvals` child table — see `architecture.md` §3.
- **`identities`/`identity_aliases` tables** are fully dead (nothing reads them) but not yet dropped —
  kept for now in case something surfaces a dependency; a clean removal candidate.
- **Multi-role support was intentionally dropped** when `change_user` (which had a `metadata.roles`
  array) merged into `hot_desk_users` (single `role_id` only). The Settings UI still has leftover
  multi-select widget code for "add another role," but the backend only honors the first/primary role
  selected — this is a known simplification, not a bug, but worth knowing if the UI looks like it
  should support more than one role per person.
