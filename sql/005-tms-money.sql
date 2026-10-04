-- Migration 005: Trust Management System — money tables.
-- All amounts are NUMERIC(14,2) rupees (never floats), matching payments.amount.
-- Safe to re-run.

create table if not exists bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,          -- PCFPT/BNK/01
  slug          text unique,                   -- saraswat | hdfc | sbi | cash | gpay
  bank          text not null,
  branch        text,
  number_masked text,                          -- last 4 digits only
  account_type  text,
  opened_on     date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists receipts (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,    -- PCFPT/RCP/2026-27/0001
  fy                  text references fiscal_years(label),
  series              text,                    -- PCFPT | M | PLAIN | CC | ONLINE
  number              integer,
  line_no             integer not null default 1,
  number_as_written   text,
  receipt_date        date,
  is_cancelled        boolean not null default false,
  is_80g              boolean not null default false,
  payment_id          uuid references payments(id) on delete set null,   -- online receipts
  pdf_file_name       text,
  notes               text,
  needs_review        boolean not null default false,
  origin              text not null default 'manual' check (origin in ('import', 'online', 'manual')),
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
-- Old receipt numbers repeat across books, so they are only unique together with FY, series and line.
create unique index if not exists uq_receipts_number on receipts (fy, series, number, line_no)
  where number is not null and deleted_at is null;
create index if not exists idx_receipts_written on receipts (number_as_written);

create table if not exists income_entries (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,  -- PCFPT/DON/2026-27/0001, PCFPT/MFE/..., PCFPT/INC/...
  entry_date            date,
  fy                    text references fiscal_years(label),
  cal_year              integer,
  cal_month             integer,
  amount                numeric(14,2) not null,
  kind                  text not null check (kind in (
                          'donation', 'membership_fee', 'sponsorship', 'advertisement', 'event_fee',
                          'csr_grant', 'book_sale', 'interest', 'refund_received', 'loan_received', 'other')),
  kind_as_written       text,
  person_id             uuid references people(id) on delete set null,
  payer_as_written      text,
  receipt_id            uuid references receipts(id) on delete set null,
  membership_id         uuid references memberships(id) on delete set null,
  mode                  text check (mode in ('cash', 'cheque', 'upi', 'neft', 'online', 'other')),
  mode_as_written       text,
  bank_account_id       uuid references bank_accounts(id) on delete set null,
  payment_ref           text,
  purpose_as_written    text,
  fund_id               uuid references funds(id) on delete set null,
  event_id              uuid references events(id) on delete set null,
  scheme_id             uuid references schemes(id) on delete set null,
  category_id           uuid references categories(id) on delete set null,
  pan_as_written        text,
  notes                 text,
  needs_review          boolean not null default false,
  origin                text not null default 'manual' check (origin in ('import', 'online', 'manual')),
  import_batch_id       uuid references import_batches(id) on delete set null,
  content_fingerprint   text unique,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index if not exists idx_income_fy_kind on income_entries (fy, kind) where deleted_at is null;
create index if not exists idx_income_date on income_entries (entry_date);
create index if not exists idx_income_person on income_entries (person_id);
create index if not exists idx_income_event on income_entries (event_id);
create index if not exists idx_income_scheme on income_entries (scheme_id);
create index if not exists idx_income_category on income_entries (category_id);
create index if not exists idx_income_payer_trgm on income_entries using gin (payer_as_written gin_trgm_ops);

create table if not exists expenses (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,  -- PCFPT/EXP/2026-27/0001
  entry_date            date,
  fy                    text references fiscal_years(label),
  cal_year              integer,
  cal_month             integer,
  amount                numeric(14,2) not null,
  cash_amount           numeric(14,2),
  bank_amount           numeric(14,2),
  voucher_no_as_written text,
  payee_person_id       uuid references people(id) on delete set null,
  payee_as_written      text,
  category_id           uuid references categories(id) on delete set null,
  head_as_written       text,
  particulars           text,
  mode                  text check (mode in ('cash', 'cheque', 'upi', 'neft', 'online', 'other')),
  mode_as_written       text,
  cheque_no             text,
  bank_account_id       uuid references bank_accounts(id) on delete set null,
  event_id              uuid references events(id) on delete set null,
  scheme_id             uuid references schemes(id) on delete set null,
  fund_id               uuid references funds(id) on delete set null,
  approved_by           text,
  notes                 text,
  needs_review          boolean not null default false,
  origin                text not null default 'manual' check (origin in ('import', 'online', 'manual')),
  import_batch_id       uuid references import_batches(id) on delete set null,
  content_fingerprint   text unique,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index if not exists idx_expenses_fy on expenses (fy, category_id) where deleted_at is null;
create index if not exists idx_expenses_date on expenses (entry_date);
create index if not exists idx_expenses_event on expenses (event_id);
create index if not exists idx_expenses_scheme on expenses (scheme_id);
create index if not exists idx_expenses_voucher on expenses (voucher_no_as_written);
create index if not exists idx_expenses_payee_trgm on expenses using gin (payee_as_written gin_trgm_ops);
create index if not exists idx_expenses_particulars_trgm on expenses using gin (particulars gin_trgm_ops);

create table if not exists fixed_deposits (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,    -- PCFPT/FD/0001
  bank                text not null,
  branch              text,
  fd_number           text,
  principal           numeric(14,2) not null,
  rate_pct            numeric(6,3),
  start_date          date,
  maturity_date       date,
  maturity_amount     numeric(14,2),
  compounding         text,
  status              text not null default 'active' check (status in ('active', 'matured', 'closed', 'renewed', 'unknown')),
  renewed_from_id     uuid references fixed_deposits(id) on delete set null,
  fund_id             uuid references funds(id) on delete set null,
  earmark_as_written  text,
  notes               text,
  needs_review        boolean not null default false,
  origin              text not null default 'manual' check (origin in ('import', 'online', 'manual')),
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index if not exists idx_fd_maturity on fixed_deposits (maturity_date) where deleted_at is null;
create index if not exists idx_fd_number on fixed_deposits (fd_number);

create table if not exists fd_events (
  id                  uuid primary key default gen_random_uuid(),
  fixed_deposit_id    uuid references fixed_deposits(id) on delete cascade,
  event_date          date,
  fy                  text references fiscal_years(label),
  kind                text not null check (kind in ('interest', 'tds', 'closure', 'renewal', 'other')),
  amount              numeric(14,2) not null,
  label_as_written    text,
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index if not exists idx_fd_events_fy on fd_events (fy, kind);

create table if not exists investments (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,    -- PCFPT/INV/01
  kind                text not null default 'mutual_fund',
  name                text not null,
  folio               text,
  notes               text,
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create table if not exists investment_transactions (
  id                  uuid primary key default gen_random_uuid(),
  investment_id       uuid not null references investments(id) on delete cascade,
  txn_date            date,
  fy                  text references fiscal_years(label),
  kind                text not null default 'purchase',
  amount              numeric(14,2) not null,
  units               numeric(18,4),
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- Money moving between the trust's own pockets. Kept out of income and expense
-- so that totals are not inflated by FD placements, closures and transfers.
create table if not exists transfers (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,    -- PCFPT/TRF/2026-27/0001
  entry_date          date,
  fy                  text references fiscal_years(label),
  amount              numeric(14,2) not null,
  kind                text not null check (kind in ('own_account', 'fd_placement', 'fd_closure', 'sip', 'petty_cash', 'reversal', 'other')),
  from_account_id     uuid references bank_accounts(id) on delete set null,
  to_account_id       uuid references bank_accounts(id) on delete set null,
  from_as_written     text,
  to_as_written       text,
  fixed_deposit_id    uuid references fixed_deposits(id) on delete set null,
  investment_id       uuid references investments(id) on delete set null,
  particulars         text,
  voucher_no_as_written text,
  needs_review        boolean not null default false,
  origin              text not null default 'manual' check (origin in ('import', 'online', 'manual')),
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index if not exists idx_transfers_fy on transfers (fy, kind);

create table if not exists bank_transactions (
  id                  uuid primary key default gen_random_uuid(),
  bank_account_id     uuid not null references bank_accounts(id) on delete cascade,
  txn_date            date,
  value_date          date,
  fy                  text references fiscal_years(label),
  narration           text,
  reference           text,
  debit               numeric(14,2),
  credit              numeric(14,2),
  balance             numeric(14,2),
  seq_in_statement    integer,
  linked_table        text,                    -- income_entries | expenses | transfers
  linked_id           uuid,
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index if not exists idx_bank_txn_account_date on bank_transactions (bank_account_id, txn_date, seq_in_statement);
create index if not exists idx_bank_txn_narration_trgm on bank_transactions using gin (narration gin_trgm_ops);

create table if not exists scheme_applications (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,    -- PCFPT/APP/2023-24/0001
  scheme_id           uuid not null references schemes(id) on delete cascade,
  person_id           uuid references people(id) on delete set null,
  applicant_as_written text,
  fy                  text references fiscal_years(label),
  applied_on          date,
  institution         text,
  status              text not null default 'received' check (status in ('received', 'approved', 'rejected', 'disbursed', 'unknown')),
  details             jsonb,
  needs_review        boolean not null default false,
  origin              text not null default 'manual' check (origin in ('import', 'online', 'manual')),
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create table if not exists scheme_disbursements (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,    -- PCFPT/DSB/2023-24/0001
  scheme_id           uuid not null references schemes(id) on delete cascade,
  person_id           uuid references people(id) on delete set null,
  beneficiary_as_written text,
  beneficiary_count   integer,                 -- when the source gives only a head-count
  fy                  text references fiscal_years(label),
  disbursed_on        date,
  amount              numeric(14,2) not null,
  institution         text,
  expense_id          uuid references expenses(id) on delete set null,
  is_repayable        boolean not null default false,
  notes               text,
  needs_review        boolean not null default false,
  origin              text not null default 'manual' check (origin in ('import', 'online', 'manual')),
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index if not exists idx_disbursements_scheme_fy on scheme_disbursements (scheme_id, fy);

create table if not exists scheme_repayments (
  id                  uuid primary key default gen_random_uuid(),
  disbursement_id     uuid not null references scheme_disbursements(id) on delete cascade,
  paid_on             date,
  amount              numeric(14,2) not null,
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create table if not exists budgets (
  id                  uuid primary key default gen_random_uuid(),
  fy                  text references fiscal_years(label),
  event_id            uuid references events(id) on delete set null,
  title               text not null,
  heading_as_written  text,
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create table if not exists budget_lines (
  id                  uuid primary key default gen_random_uuid(),
  budget_id           uuid not null references budgets(id) on delete cascade,
  kind                text not null check (kind in ('income', 'expense')),
  category_id         uuid references categories(id) on delete set null,
  head_as_written     text,
  amount              numeric(14,2) not null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now()
);

-- Printed year-end figures (receipts-and-payments sheets, Tally accounts).
-- These are the reconciliation targets, and the only data for 2018-22.
create table if not exists annual_statements (
  id                  uuid primary key default gen_random_uuid(),
  fy                  text references fiscal_years(label),
  entity              text not null default 'trust' check (entity in ('trust', 'pre_trust')),
  source_label        text not null,           -- e.g. 'Receipts & payments sheet', 'Tally accounts v1'
  is_signed_audit     boolean not null default false,
  notes               text,
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now()
);

create table if not exists annual_statement_lines (
  id                  uuid primary key default gen_random_uuid(),
  statement_id        uuid not null references annual_statements(id) on delete cascade,
  side                text not null check (side in ('opening', 'inward', 'outward', 'closing', 'total', 'memo')),
  label               text not null,
  amount              numeric(14,2) not null,
  line_date           date,
  cell_ref            text,
  line_order          integer,
  content_fingerprint text unique,
  created_at          timestamptz not null default now()
);
create index if not exists idx_statement_lines_stmt on annual_statement_lines (statement_id, side);

-- Attachments: voucher scans, bills, FD papers.
create table if not exists documents (
  id             uuid primary key default gen_random_uuid(),
  record_table   text,
  record_id      uuid,
  file_name      text not null,
  mime           text,
  sha256         text,
  size_bytes     bigint,
  content        bytea,
  source_file_id uuid references source_files(id) on delete set null,
  uploaded_by    uuid,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists idx_documents_record on documents (record_table, record_id);

-- An event's or activity's own accounts, as kept by its organisers (Gaurav
-- Sohala workbooks, book-sale registers ...). This is a satellite ledger: the
-- same money also passes through the trust's main books, so these lines are
-- reported per event and are never added to trust-wide income or expense.
create table if not exists event_account_lines (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references events(id) on delete cascade,
  side                text not null check (side in ('income', 'expense', 'memo')),
  line_date           date,
  head_as_written     text,
  party_as_written    text,
  person_id           uuid references people(id) on delete set null,
  amount              numeric(14,2) not null,
  quantity            numeric(12,2),
  mode_as_written     text,
  reference           text,
  notes               text,
  needs_review        boolean not null default false,
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index if not exists idx_event_lines_event on event_account_lines (event_id, side);
