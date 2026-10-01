// ────────────────────────────────────────────────────────────────
//  Versioned SQL migration runner.
//
//  Runs every *.sql file in backend/migrations/, in filename order,
//  that hasn't been applied yet. Each file runs in its own
//  transaction; success is recorded in `public.schema_migrations`
//  so re-running this script is a safe no-op for anything already
//  applied.
//
//  This picks up where the manual 000_/001_ scripts in backend/scripts/
//  left off (those were applied by hand before this runner existed —
//  new migrations start at 002_ and live in backend/migrations/).
//
//    npm run db:migrate            -> apply all pending migrations
//    npm run db:migrate -- --list  -> show applied vs. pending, no changes
// ────────────────────────────────────────────────────────────────
import '../config/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sequelize } from '../models/index.js';
import { QueryTypes } from 'sequelize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');
const listOnly = process.argv.includes('--list');

const ensureTrackingTable = async () => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename character varying PRIMARY KEY,
      applied_at timestamp with time zone NOT NULL DEFAULT now()
    );
  `);
};

const run = async () => {
  await sequelize.authenticate();
  await ensureTrackingTable();

  const applied = new Set(
    (await sequelize.query('SELECT filename FROM public.schema_migrations', { type: QueryTypes.SELECT })).map(
      (r) => r.filename
    )
  );

  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    : [];

  if (files.length === 0) {
    console.log('[db:migrate] no migration files found in backend/migrations/');
    await sequelize.close();
    return;
  }

  console.log(`[db:migrate] ${files.length} migration file(s), ${applied.size} already applied`);
  for (const file of files) {
    const status = applied.has(file) ? 'applied' : 'PENDING';
    console.log(`  ${status === 'applied' ? '✔' : '•'} ${file}  (${status})`);
  }

  if (listOnly) {
    await sequelize.close();
    return;
  }

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`\n[db:migrate] applying ${file} ...`);
    const tx = await sequelize.transaction();
    try {
      await sequelize.query(sql, { transaction: tx });
      await sequelize.query(
        'INSERT INTO public.schema_migrations (filename) VALUES (:file)',
        { replacements: { file }, transaction: tx }
      );
      await tx.commit();
      console.log(`[db:migrate] ✔ ${file} applied`);
    } catch (err) {
      await tx.rollback();
      console.error(`[db:migrate] ✘ ${file} FAILED — rolled back:`, err.message);
      process.exitCode = 1;
      break;
    }
  }

  await sequelize.close();
};

run().catch(async (err) => {
  console.error('[db:migrate] fatal:', err.message);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
