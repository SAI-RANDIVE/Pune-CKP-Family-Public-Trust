-- Migration 010: keep every extra "as written" value the importer preserved.
-- The transforms carry original text (the date or amount exactly as typed, a
-- remark, a heading) beyond the typed columns. It is stored here per record so
-- that nothing read from the archive is discarded. Safe to re-run.

do $$
declare t text;
begin
  foreach t in array array[
    'people', 'memberships', 'membership_snapshots', 'trust_officers', 'receipts', 'fixed_deposits',
    'investments', 'income_entries', 'expenses', 'transfers', 'bank_transactions', 'fd_events',
    'investment_transactions', 'scheme_applications', 'scheme_disbursements', 'scheme_repayments',
    'budgets', 'budget_lines', 'annual_statements', 'annual_statement_lines', 'event_account_lines']
  loop
    execute format('alter table %I add column if not exists source_extra jsonb', t);
  end loop;
end $$;
