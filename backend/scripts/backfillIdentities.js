// ────────────────────────────────────────────────────────────────
//  One-time backfill: populate public.identities / identity_aliases
//  from employees + change_user, then normalize every known identity
//  reference column (requester_id, approver_id, actor_id, ...) onto
//  the canonical identities.id — using the exact same alias shapes
//  (`EMP-<id>`, `S8-<id>`, `usr-<id>`, bare id, email) that
//  services/identityResolver.service.js already resolves at read time.
//
//  Does NOT delete or invent data: any reference value that has no
//  known alias is left untouched and reported at the end, so a human
//  decides what to do with it (map it by hand, or decide it's
//  disposable test-data junk) rather than this script guessing.
//
//    node scripts/backfillIdentities.js            -> apply
//    node scripts/backfillIdentities.js --dry-run   -> report only
// ────────────────────────────────────────────────────────────────
import '../config/env.js';
import { sequelize } from '../models/index.js';
import { QueryTypes } from 'sequelize';

const dryRun = process.argv.includes('--dry-run');
const q = (sql, opts) => sequelize.query(sql, { type: QueryTypes.SELECT, ...opts });

const REFERENCE_COLUMNS = [
  ['change_requests', 'requester_id'],
  ['change_requests', 'approver_id'],
  ['change_request_approvals', 'approver_id'],
  ['pre_spend_requests', 'requester_id'],
  ['travel_requests', 'requester_id'],
  ['audit_logs', 'actor_id'],
  // category_role_assignments merges what used to be change_manager_categories
  // + change_implementer_categories (see migration 006) — already normalized
  // under both old names before that merge; kept here so a future
  // --dry-run / re-run against this table still works.
  ['category_role_assignments', 'user_id']
];

const norm = (v) => String(v).trim().toLowerCase();

async function run() {
  await sequelize.authenticate();

  const employees = await q('SELECT id, name, email FROM employees');
  const changeUsers = await q('SELECT id, name, email FROM change_user');

  // identityId -> { source, employeeId, changeUserId, email, displayName }
  const identities = new Map();
  // alias (lowercased) -> identityId
  const aliases = new Map();
  const addAlias = (alias, identityId) => {
    if (alias === null || alias === undefined || alias === '') return;
    aliases.set(norm(alias), identityId);
  };

  // ChangeUser wins on email collision (matches IdentityResolver.resolveByEmail order).
  const emailToChangeUser = new Map(changeUsers.map((cu) => [norm(cu.email), cu]));

  for (const cu of changeUsers) {
    const id = String(cu.id);
    identities.set(id, { source: 'CHANGE_USER', employeeId: null, changeUserId: cu.id, email: cu.email, displayName: cu.name });
    addAlias(cu.id, id);
    addAlias(`S8-${cu.id}`, id);
    addAlias(`EMP-${cu.id}`, id);
    addAlias(`usr-${cu.id}`, id);
    addAlias(cu.email, id);
  }

  for (const emp of employees) {
    const linkedChangeUser = emailToChangeUser.get(norm(emp.email));
    if (linkedChangeUser) {
      // This employee already resolves through their ChangeUser profile; link employee_id on that identity.
      const existing = identities.get(String(linkedChangeUser.id));
      if (existing) existing.employeeId = emp.id;
      addAlias(emp.id, String(linkedChangeUser.id));
      addAlias(`EMP-${emp.id}`, String(linkedChangeUser.id));
      addAlias(`S8-${emp.id}`, String(linkedChangeUser.id));
      continue;
    }
    const id = `EMP-${emp.id}`;
    identities.set(id, { source: 'EMPLOYEE_DIRECTORY', employeeId: emp.id, changeUserId: null, email: emp.email, displayName: emp.name });
    addAlias(emp.id, id);
    addAlias(id, id);
    addAlias(`S8-${emp.id}`, id);
    addAlias(emp.email, id);
  }

  // Synthetic identity for system-generated audit entries.
  identities.set('SYSTEM', { source: 'SYSTEM', employeeId: null, changeUserId: null, email: null, displayName: 'System' });
  addAlias('SYSTEM', 'SYSTEM');
  addAlias('system', 'SYSTEM');

  console.log(`[backfill] computed ${identities.size} canonical identities, ${aliases.size} aliases`);

  if (!dryRun) {
    for (const [id, info] of identities) {
      await sequelize.query(
        `INSERT INTO public.identities (id, source, employee_id, change_user_id, email, display_name)
         VALUES (:id, :source, :employeeId, :changeUserId, :email, :displayName)
         ON CONFLICT (id) DO UPDATE SET
           source = EXCLUDED.source, employee_id = EXCLUDED.employee_id,
           change_user_id = EXCLUDED.change_user_id, email = EXCLUDED.email,
           display_name = EXCLUDED.display_name, updated_at = now()`,
        { replacements: { id, ...info } }
      );
    }
    for (const [alias, identityId] of aliases) {
      await sequelize.query(
        `INSERT INTO public.identity_aliases (alias, identity_id) VALUES (:alias, :identityId)
         ON CONFLICT (alias) DO UPDATE SET identity_id = EXCLUDED.identity_id`,
        { replacements: { alias, identityId } }
      );
    }
    console.log('[backfill] identities + identity_aliases populated');
  }

  // Normalize each reference column onto the canonical id.
  const unresolved = {};
  for (const [table, col] of REFERENCE_COLUMNS) {
    const rows = await q(`SELECT DISTINCT "${col}" AS v FROM "${table}" WHERE "${col}" IS NOT NULL`);
    let changed = 0;
    const misses = [];
    for (const { v } of rows) {
      const canonical = aliases.get(norm(v));
      if (!canonical) {
        misses.push(v);
        continue;
      }
      if (canonical === v) continue; // already canonical
      if (!dryRun) {
        const [, meta] = await sequelize.query(
          `UPDATE "${table}" SET "${col}" = :canonical WHERE "${col}" = :orig`,
          { replacements: { canonical, orig: v } }
        );
        changed += meta.rowCount ?? 0;
      } else {
        changed++;
      }
    }
    console.log(`[backfill] ${table}.${col}: ${rows.length} distinct values, ${changed} row(s) ${dryRun ? 'would be' : ''} normalized, ${misses.length} unresolved`);
    if (misses.length) unresolved[`${table}.${col}`] = misses;
  }

  if (Object.keys(unresolved).length) {
    console.log('\n[backfill] values with NO known identity mapping (left untouched):');
    for (const [key, vals] of Object.entries(unresolved)) {
      console.log(`  ${key}:`, vals);
    }
  } else {
    console.log('\n[backfill] every reference value resolved — safe to add FK constraints next.');
  }

  await sequelize.close();
}

run().catch(async (err) => {
  console.error('[backfill] fatal:', err.message);
  try { await sequelize.close(); } catch { /* ignore */ }
  process.exit(1);
});
