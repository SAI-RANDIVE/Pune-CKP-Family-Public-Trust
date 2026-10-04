/**
 * Applies every sql/*.sql file in filename order against DATABASE_URL.
 * Every migration is written to be idempotent, so this is safe to re-run.
 *
 * Usage: npm run db:migrate
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in first.');
    process.exit(1);
  }

  const sqlDir = path.join(__dirname, '..', 'sql');
  const files = fs.readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort();

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    for (const file of files) {
      process.stdout.write(`  ${file} ... `);
      await pool.query(fs.readFileSync(path.join(sqlDir, file), 'utf8'));
      console.log('ok');
    }
    console.log(`\nApplied ${files.length} migration file(s).`);
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
