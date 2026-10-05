import { one } from './db';

/**
 * Where each kind of record lives in the management system, and which tables
 * the provenance viewer and the ID search are allowed to touch. Table names
 * that reach SQL are only ever taken from this whitelist.
 */
export const RECORD_TABLES = {
  people: { label: 'rec.people' },
  memberships: { label: 'rec.memberships' },
  receipts: { label: 'rec.receipts' },
  income_entries: { label: 'rec.income_entries' },
  expenses: { label: 'rec.expenses' },
  transfers: { label: 'rec.transfers' },
  fixed_deposits: { label: 'rec.fixed_deposits' },
  fd_events: { label: 'rec.fd_events' },
  investments: { label: 'rec.investments' },
  investment_transactions: { label: 'rec.investment_transactions' },
  bank_transactions: { label: 'rec.bank_transactions' },
  scheme_applications: { label: 'rec.scheme_applications' },
  scheme_disbursements: { label: 'rec.scheme_disbursements' },
  scheme_repayments: { label: 'rec.scheme_repayments' },
  events: { label: 'rec.events' },
  event_account_lines: { label: 'rec.event_account_lines' },
  schemes: { label: 'rec.schemes' },
  budgets: { label: 'rec.budgets' },
  budget_lines: { label: 'rec.budget_lines' },
  annual_statements: { label: 'rec.annual_statements' },
  annual_statement_lines: { label: 'rec.annual_statement_lines' },
  membership_snapshots: { label: 'rec.membership_snapshots' },
  trust_officers: { label: 'rec.trust_officers' },
  bank_accounts: { label: 'rec.bank_accounts' },
};

export const isRecordTable = (table) => Object.prototype.hasOwnProperty.call(RECORD_TABLES, table);

/** Tables that carry a needs_review flag (cleared when a review item is approved). */
export const REVIEWABLE = ['people', 'memberships', 'receipts', 'income_entries', 'expenses', 'transfers',
  'fixed_deposits', 'scheme_applications', 'scheme_disbursements', 'event_account_lines'];

/**
 * The page that shows a record, or the provenance viewer when it has no page
 * of its own. Always returns a path inside the management system.
 */
export async function hrefForRecord(table, id) {
  if (!isRecordTable(table)) return '/search';
  switch (table) {
    case 'people': {
      const p = await one('select id, merged_into_id from people where id = $1', [id]);
      return p ? `/people/${p.merged_into_id || p.id}` : '/people';
    }
    case 'memberships': {
      const m = await one('select person_id from memberships where id = $1', [id]);
      return m ? `/people/${m.person_id}` : '/members';
    }
    case 'receipts': {
      const r = await one('select id from income_entries where receipt_id = $1 and deleted_at is null order by created_at limit 1', [id]);
      return r ? `/donations/${r.id}` : `/source/receipts/${id}`;
    }
    case 'income_entries': return `/donations/${id}`;
    case 'expenses': return `/expenses/${id}`;
    case 'fixed_deposits': return `/deposits/${id}`;
    case 'fd_events': {
      const e = await one('select fixed_deposit_id from fd_events where id = $1', [id]);
      return e?.fixed_deposit_id ? `/deposits/${e.fixed_deposit_id}` : `/source/fd_events/${id}`;
    }
    case 'scheme_disbursements':
    case 'scheme_applications': {
      const s = await one(`select scheme_id from ${table} where id = $1`, [id]);
      return s ? `/schemes/${s.scheme_id}` : '/schemes';
    }
    case 'schemes': return `/schemes/${id}`;
    case 'events': return `/events/${id}`;
    case 'event_account_lines': {
      const l = await one('select event_id from event_account_lines where id = $1', [id]);
      return l ? `/events/${l.event_id}` : '/events';
    }
    case 'investments': return '/investments';
    default: return `/source/${table}/${id}`;
  }
}
