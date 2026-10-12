/**
 * Removes everything created while testing, so only the trust's own records
 * remain. Run it once before going live.
 *
 *   node scripts/purge-test-data.js            show what would be removed (changes nothing)
 *   node scripts/purge-test-data.js --apply    back up, then remove
 *
 * What counts as test data:
 *   - online payments made with Razorpay TEST keys (payments.is_test) and
 *     everything hanging off them: gateway events, receipt e-mails, and the
 *     website sign-ups ("members") that have no real payment;
 *   - e-mail verification codes, sign-in codes and rate-limit counters;
 *   - the website's receipt and membership-number counters (put back to zero so
 *     the first real payment gets number 1);
 *   - the audit log written during testing (--keep-audit leaves it alone);
 *   - member-portal test sessions.
 *
 * What is never touched: anything imported from the trust's registers, anything
 * typed into the management system (listed, for you to check, but kept), and
 * the logins themselves.
 *
 * Before removing, every row is written to tmp/test-data-backup-<time>.json
 * (the tmp folder is not committed).
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const APPLY = process.argv.includes('--apply');
const KEEP_AUDIT = process.argv.includes('--keep-audit');

async function tableExists(client, name) {
  const { rows } = await client.query('select to_regclass($1) as t', [`public.${name}`]);
  return Boolean(rows[0].t);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Put it in .env.local first.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: require('./db-url').databaseUrl(), ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query('begin');

    const testPayments = (await client.query('select * from payments where is_test')).rows;
    const paymentIds = testPayments.map((p) => p.id);
    // Website sign-ups that exist only because of a test payment.
    const testMembers = (await client.query(
      `select m.* from members m
        where not exists (select 1 from payments p where p.member_id = m.id and not p.is_test)
          and not exists (select 1 from people pe where pe.legacy_member_id = m.id)
          and not exists (select 1 from memberships ms where ms.legacy_member_id = m.id)`)).rows;
    const memberIds = testMembers.map((m) => m.id);

    const plan = [
      ['payment_events', 'payment_id = any($1::uuid[])', [paymentIds]],
      ['receipt_emails', 'payment_id = any($1::uuid[])', [paymentIds]],
      ['payments', 'id = any($1::uuid[])', [paymentIds]],
      ['members', 'id = any($1::uuid[])', [memberIds]],
      ['email_verifications', 'true', []],
      ['email_otps', 'true', []],
      ['rate_limits', 'true', []],
      ['receipt_counters', 'true', []],
      ['form_drafts', 'true', []],
      ['member_sessions', 'true', []],
      ...(KEEP_AUDIT ? [] : [['audit_logs', 'true', []]]),
    ];

    const backup = {};
    console.log(`\n${APPLY ? 'Removing' : 'Would remove'}:`);
    for (const [table, where, params] of plan) {
      if (!(await tableExists(client, table))) continue;
      const { rows } = await client.query(`select * from ${table} where ${where}`, params);
      // Stored receipt PDFs are large and reproducible; keep their size only.
      backup[table] = rows.map((r) => (r.receipt_pdf ? { ...r, receipt_pdf: `<${r.receipt_pdf.length} bytes>` } : r));
      console.log(`  ${String(rows.length).padStart(5)}  ${table}`);
    }

    console.log('\nTyped into the management system (kept; remove them there if they were tests):');
    for (const table of ['people', 'memberships', 'income_entries', 'receipts', 'expenses', 'fixed_deposits', 'transfers', 'scheme_disbursements']) {
      const { rows } = await client.query(`select count(*)::int as n from ${table} where import_batch_id is null`);
      console.log(`  ${String(rows[0].n).padStart(5)}  ${table}`);
    }

    if (!APPLY) {
      await client.query('rollback');
      console.log('\nNothing was changed. Run again with --apply to remove the rows above.\n');
      return;
    }

    const dir = path.join(__dirname, '..', 'tmp');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `test-data-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 1));

    // receipts.payment_id points at online payments: nothing imported uses a test payment, but be certain.
    const linked = await client.query('select count(*)::int as n from receipts where payment_id = any($1::uuid[])', [paymentIds]);
    if (linked.rows[0].n) throw new Error(`${linked.rows[0].n} receipt(s) in the books point at a test payment; stopping so nothing is orphaned.`);

    for (const [table, where, params] of plan) {
      if (!(await tableExists(client, table))) continue;
      await client.query(`delete from ${table} where ${where}`, params);
    }
    await client.query('commit');
    console.log(`\nDone. A copy of everything removed is in ${path.relative(path.join(__dirname, '..'), file)}\n`);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error('\nNothing was removed:', err.message, '\n');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
