import { apiGuard, audit, hasOtpGrant } from '../../../../lib/tms/auth';
import { q } from '../../../../lib/tms/db';
import { todayIso } from '../../../../lib/tms/format';
import { tablesWorkbook } from '../../../../lib/tms/excel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Tables in the backup, in reading order. Secrets (password hashes, session
 * tokens, one-time codes) and stored file contents are never exported.
 */
const TABLES = [
  'people', 'person_name_variants', 'memberships', 'membership_numbers', 'membership_snapshots', 'trust_officers',
  'receipts', 'income_entries', 'expenses', 'transfers', 'bank_accounts', 'bank_transactions',
  'fixed_deposits', 'fd_events', 'investments', 'investment_transactions',
  'schemes', 'scheme_applications', 'scheme_disbursements', 'scheme_repayments',
  'events', 'event_account_lines', 'categories', 'funds', 'budgets', 'budget_lines',
  'annual_statements', 'annual_statement_lines', 'fiscal_years', 'entity_codes', 'id_sequences',
  'import_review_queue', 'person_merge_candidates', 'source_files', 'import_batches',
  'members', 'payments', 'payment_events', 'receipt_emails', 'audit_logs', 'admin_users',
];
const RAW = ['record_sources', 'raw_rows'];
const DROP = {
  payments: ['receipt_pdf', 'razorpay_signature'], members: ['profile_token'], documents: ['content'],
  admin_users: ['password_hash'],
};

/** Full backup as one Excel workbook. Super Admin only, and only after the e-mailed code. */
export async function GET(request) {
  const guard = await apiGuard(request, 'super_admin');
  if (guard.response) return guard.response;
  if (!(await hasOtpGrant(guard.admin))) {
    return new Response(null, { status: 303, headers: { Location: `/verify?next=${encodeURIComponent('/settings/backup')}`, 'Cache-Control': 'no-store' } });
  }
  const withRaw = new URL(request.url).searchParams.get('raw') === '1';

  try {
    const sheets = [];
    for (const name of [...TABLES, 'documents', ...(withRaw ? RAW : [])]) {
      // Names come from the fixed lists above, never from the request.
      const drop = DROP[name] || [];
      const rows = await q(`select to_jsonb(t)${drop.map((c) => ` - '${c}'`).join('')} as j from ${name} t limit 200000`);
      const cols = await q(
        `select column_name from information_schema.columns where table_schema = current_schema() and table_name = $1 order by ordinal_position`, [name]);
      const columns = cols.map((c) => c.column_name).filter((c) => !drop.includes(c));
      sheets.push({ name, columns, rows: rows.map((r) => r.j) });
    }
    const counts = Object.fromEntries(sheets.map((s) => [s.name, s.rows.length]));
    const buffer = await tablesWorkbook(sheets);
    await audit(guard.admin, { action: 'backup_downloaded', entity: 'backup', detail: { raw: withRaw, bytes: buffer.length, counts } });
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="pcfpt-backup-${todayIso()}${withRaw ? '-with-source-rows' : ''}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[TMS] backup failed:', err?.message);
    return new Response(null, { status: 303, headers: { Location: '/settings/backup?err=export' } });
  }
}
