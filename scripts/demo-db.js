/**
 * The demo database: a separate copy of the trust's data for showing the
 * system to people, so that nothing typed during a demonstration can reach the
 * real books.
 *
 *   node scripts/demo-db.js create     make (or remake) the demo database from the real one
 *   node scripts/demo-db.js status     say which database is in use and how the two compare
 *   node scripts/demo-db.js drop       remove the demo database
 *
 * How the two are kept apart: the demo is a different DATABASE on the same
 * server (default name ckp_demo). The website uses it only while
 * DATA_MODE=demo is set in .env.local; remove that line (or set
 * DATA_MODE=live) and it is back on the real database. The real database is
 * only ever READ by this script.
 *
 * What the copy changes, so a demonstration cannot leak or misfire:
 *   - Aadhaar and PAN numbers are replaced with made-up ones;
 *   - members' logins, sessions, one-time codes and the audit log are left out;
 *   - (in the website itself) every e-mail and WhatsApp message goes to the
 *     demo address instead of the real member while DATA_MODE=demo.
 */
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
const { DEMO_NAME, databaseUrl, isDemo, withDatabase } = require('./db-url');

const ssl = { rejectUnauthorized: false };
const SKIP_DATA = new Set(['admin_sessions', 'member_sessions', 'member_accounts', 'email_otps', 'email_verifications', 'rate_limits', 'audit_logs', 'form_drafts']);
const BATCH = 400;

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

async function listTables(pool) {
  const { rows } = await pool.query("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1");
  return rows.map((r) => r.table_name);
}

/** Tables ordered so that a table comes after everything it refers to. */
async function inDependencyOrder(pool, tables) {
  const { rows } = await pool.query(
    `select conrelid::regclass::text as child, confrelid::regclass::text as parent
       from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`);
  const parents = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of rows) {
    const c = child.replace(/"/g, '');
    const p = parent.replace(/"/g, '');
    if (c !== p && parents.has(c) && parents.has(p)) parents.get(c).add(p);
  }
  const done = [];
  const seen = new Set();
  const visit = (t, trail = new Set()) => {
    if (seen.has(t) || trail.has(t)) return; // a cycle is broken where it is met; such columns are filled in the second pass
    trail.add(t);
    for (const p of parents.get(t)) visit(p, trail);
    seen.add(t);
    done.push(t);
  };
  tables.forEach((t) => visit(t));
  return done;
}

async function create() {
  const mainUrl = databaseUrl({ forceMain: true });
  const main = new Pool({ connectionString: mainUrl, ssl, max: 2 });
  const admin = new Pool({ connectionString: withDatabase(mainUrl, 'postgres'), ssl, max: 1 });

  console.log(`\nMaking the demo database "${DEMO_NAME}" from the real one (the real one is only read).\n`);
  await admin.query(`drop database if exists ${quote(DEMO_NAME)} with (force)`).catch(async () => admin.query(`drop database if exists ${quote(DEMO_NAME)}`));
  await admin.query(`create database ${quote(DEMO_NAME)}`);
  await admin.end();

  const demo = new Pool({ connectionString: withDatabase(mainUrl, DEMO_NAME), ssl, max: 2 });
  try {
    // 1. Structure: the same migrations, in the same order, as the real database.
    const { execFileSync } = require('child_process');
    execFileSync(process.execPath, [path.join(__dirname, 'migrate.js')], { stdio: 'pipe', env: { ...process.env, DATA_MODE: 'demo' } });
    console.log('  structure created (all migrations applied)');

    // 2. Data, table by table. Foreign keys are switched to "check at the end" for the copy.
    const tables = await inDependencyOrder(main, await listTables(main));
    const demoTables = new Set(await listTables(demo));
    const client = await demo.connect();
    let total = 0;
    try {
      await client.query('begin');
      const fks = await client.query("select conrelid::regclass::text as tbl, conname from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace");
      for (const fk of fks.rows) await client.query(`alter table ${fk.tbl} alter constraint ${quote(fk.conname)} deferrable initially deferred`);
      for (const table of tables) {
        if (!demoTables.has(table) || table === 'schema_migrations') continue;
        // Reference rows inserted by the migrations themselves are replaced by the real ones.
        await client.query(`delete from ${quote(table)}`);
        if (SKIP_DATA.has(table)) continue;
        const cols = (await main.query(
          "select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position", [table])).rows;
        const names = cols.map((c) => c.column_name);
        const jsonCols = new Set(cols.filter((c) => c.data_type === 'json' || c.data_type === 'jsonb').map((c) => c.column_name));
        const { rows } = await main.query(`select ${names.map(quote).join(', ')} from ${quote(table)}`);
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          const params = [];
          const tuples = chunk.map((row) => `(${names.map((n) => {
            let v = row[n];
            if (v !== null && jsonCols.has(n)) v = JSON.stringify(v);
            params.push(v);
            return `$${params.length}`;
          }).join(', ')})`);
          await client.query(`insert into ${quote(table)} (${names.map(quote).join(', ')}) values ${tuples.join(', ')}`, params);
        }
        total += rows.length;
        if (rows.length) console.log(`  ${String(rows.length).padStart(6)}  ${table}`);
      }

      // 3. Nothing that identifies a person to the government stays real.
      await client.query(`update people set
          aadhaar = case when aadhaar is null then null else lpad((abs(hashtext(id::text)) % 1000000000000)::text, 12, '9') end,
          pan = case when pan is null then null else 'DEMOP' || lpad((abs(hashtext(id::text)) % 10000)::text, 4, '0') || 'D' end`);
      await client.query("update members set pan_number = null where pan_number is not null");
      // 4. The trustees' logins come across, so the same passwords work in the demo.
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    console.log(`\n  ${total} rows copied. Aadhaar and PAN numbers were replaced with made-up ones.`);
    console.log(`\nThe demo database is ready. To use it, add this line to .env.local and restart the website:\n\n    DATA_MODE=demo\n\nTo go back to the real data, remove that line (or set DATA_MODE=live).\n`);
  } finally {
    await demo.end();
    await main.end();
  }
}

async function status() {
  const mainUrl = databaseUrl({ forceMain: true });
  console.log(`\nThe website is set to use: ${isDemo() ? `the DEMO database (${DEMO_NAME})` : 'the REAL database'}  (DATA_MODE=${process.env.DATA_MODE || 'not set'})\n`);
  for (const [label, url] of [['real', mainUrl], ['demo', withDatabase(mainUrl, DEMO_NAME)]]) {
    const pool = new Pool({ connectionString: url, ssl, max: 1 });
    try {
      const { rows } = await pool.query(
        `select current_database() as db,
                (select count(*) from people)::int as people, (select count(*) from memberships)::int as memberships,
                (select count(*) from income_entries)::int as income, (select count(*) from expenses)::int as expenses,
                (select count(*) from admin_users)::int as logins`);
      console.log(`  ${label.padEnd(5)} ${JSON.stringify(rows[0])}`);
    } catch (err) {
      console.log(`  ${label.padEnd(5)} not available (${err.code === '3D000' ? 'it has not been created' : err.message})`);
    } finally {
      await pool.end();
    }
  }
  console.log('');
}

async function drop() {
  const admin = new Pool({ connectionString: withDatabase(databaseUrl({ forceMain: true }), 'postgres'), ssl, max: 1 });
  try {
    await admin.query(`drop database if exists ${quote(DEMO_NAME)} with (force)`);
    console.log(`\nThe demo database "${DEMO_NAME}" has been removed. The real database was not touched.\n`);
  } finally {
    await admin.end();
  }
}

const command = process.argv[2];
const run = { create, status, drop }[command];
if (!run) {
  console.log('Usage: node scripts/demo-db.js create | status | drop');
  process.exit(1);
}
if (DEMO_NAME === new URL(process.env.DATABASE_URL || 'postgres://x/x').pathname.slice(1)) {
  console.error('DEMO_DATABASE_NAME is the same as the real database. Refusing to continue.');
  process.exit(1);
}
run().catch((err) => { console.error('\nFailed:', err.message, '\n'); process.exit(1); });
