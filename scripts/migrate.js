/**
 * Applies the SQL migrations in sql/ against DATABASE_URL.
 *
 * Order: schema.sql first (the base tables), then the numbered files in
 * filename order. Each file runs once and is recorded in schema_migrations
 * with its checksum; a file whose contents changed since it was applied is
 * run again, which is safe because every migration is written to be
 * idempotent (IF NOT EXISTS / CREATE OR REPLACE).
 *
 * Usage: npm run db:migrate            apply what is pending
 *        npm run db:migrate -- --dry-run   list what would run, change nothing
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const dryRun = process.argv.includes('--dry-run');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in first.');
    process.exit(1);
  }

  const sqlDir = path.join(__dirname, '..', 'sql');
  const numbered = fs.readdirSync(sqlDir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
  const files = ['schema.sql', ...numbered];

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query(`create table if not exists schema_migrations (
      file_name  text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    )`);
    const { rows } = await pool.query('select file_name, checksum from schema_migrations');
    const applied = new Map(rows.map((r) => [r.file_name, r.checksum]));

    let ran = 0;
    for (const file of files) {
      const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const state = !applied.has(file) ? 'new' : applied.get(file) !== checksum ? 'changed' : 'applied';
      if (state === 'applied') continue;

      process.stdout.write(`  ${file} (${state}) ... `);
      if (dryRun) {
        console.log('would run');
        ran += 1;
        continue;
      }
      // A multi-statement query runs as one implicit transaction, so a failing
      // migration leaves nothing half-applied.
      await pool.query(sql);
      await pool.query(
        `insert into schema_migrations (file_name, checksum) values ($1, $2)
         on conflict (file_name) do update set checksum = excluded.checksum, applied_at = now()`,
        [file, checksum]
      );
      console.log('ok');
      ran += 1;
    }
    console.log(ran === 0 ? '\nNothing to apply: the database is up to date.'
      : `\n${dryRun ? 'Would apply' : 'Applied'} ${ran} migration file(s).`);
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
