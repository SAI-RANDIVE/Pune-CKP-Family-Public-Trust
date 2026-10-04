/**
 * Runs sql/schema.sql against the Neon database in DATABASE_URL.
 * Usage: npm run db:init
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

  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query(sql);
    console.log('Database schema created / verified successfully.');
  } catch (err) {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
