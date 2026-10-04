-- Migration 004: Trust Management System — provenance, reference data, IDs,
-- people and membership. Additive only: the existing members / payments /
-- receipt_counters tables and the checkout flow are not touched.
-- Safe to re-run (everything is IF NOT EXISTS).

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Provenance: every imported value traces back to an exact source cell
-- ---------------------------------------------------------------------------
create table if not exists source_files (
  id                uuid primary key default gen_random_uuid(),
  file_code         text,                      -- F001.. from the Phase 0 inventory (informational)
  path              text not null,
  name              text not null,
  ext               text,
  sha256            text not null unique,
  size_bytes        bigint,
  internal_saved_at timestamptz,               -- last-saved date stored inside the workbook
  role              text not null default 'unclassified',
  created_at        timestamptz not null default now()
);

create table if not exists import_batches (
  id             uuid primary key default gen_random_uuid(),
  label          text not null,
  script_version text,
  status         text not null default 'running' check (status in ('running', 'loaded', 'rolled_back', 'failed')),
  counts         jsonb,
  run_by         text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

-- Original cell values, untouched. Never updated after insert.
create table if not exists raw_rows (
  id              bigserial primary key,
  import_batch_id uuid references import_batches(id) on delete set null,
  source_file_id  uuid not null references source_files(id) on delete cascade,
  sheet_name      text not null,
  row_number      integer not null,            -- 1-based, as Excel shows it
  cells           jsonb not null,              -- {"A": value, "B": value, ...}; formulas under "_f"
  fingerprint     text,
  unique (source_file_id, sheet_name, row_number)
);

-- One clean record may come from several raw rows (the same transaction is
-- often recorded in three or four sheets).
create table if not exists record_sources (
  id           bigserial primary key,
  record_table text not null,
  record_id    uuid not null,
  raw_row_id   bigint not null references raw_rows(id) on delete cascade,
  role         text not null default 'primary' check (role in ('primary', 'duplicate', 'enrichment')),
  unique (record_table, record_id, raw_row_id)
);
create index if not exists idx_record_sources_record on record_sources (record_table, record_id);
create index if not exists idx_record_sources_raw on record_sources (raw_row_id);

create table if not exists import_review_queue (
  id               uuid primary key default gen_random_uuid(),
  import_batch_id  uuid references import_batches(id) on delete set null,
  kind             text not null,              -- duplicate_person | duplicate_transaction | total_mismatch | ...
  severity         text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  title            text not null,
  evidence         jsonb,
  confidence       numeric(4,3),
  suggested_action text,
  record_table     text,
  record_id        uuid,
  status           text not null default 'open' check (status in ('open', 'approved', 'merged', 'rejected', 'resolved')),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text,
  fingerprint      text unique,                -- keeps re-imports from re-queuing a decided item
  created_at       timestamptz not null default now()
);
create index if not exists idx_review_queue_status on import_review_queue (status, kind);

-- ---------------------------------------------------------------------------
-- Uniform trust IDs. One counter per series; serials are padded to a minimum
-- width and simply grow past it, so a series can never run out.
-- entity_codes is the single lookup: any ID, new or legacy, finds its record.
-- ---------------------------------------------------------------------------
create table if not exists id_sequences (
  key      text primary key,                   -- e.g. 'SLV/MEM', 'PCFPT/DON/2026-27'
  last_seq bigint not null default 0
);

create table if not exists entity_codes (
  code         text primary key,
  kind         text not null default 'system' check (kind in ('system', 'legacy')),
  record_table text not null,
  record_id    uuid not null,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_entity_codes_record on entity_codes (record_table, record_id);
create index if not exists idx_entity_codes_trgm on entity_codes using gin (code gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table if not exists fiscal_years (
  label      text primary key,                 -- '2025-26'
  start_date date not null,
  end_date   date not null,
  is_closed  boolean not null default false
);

create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  kind       text not null check (kind in ('income', 'expense')),
  name_en    text not null,
  name_mr    text,
  parent_id  uuid references categories(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists funds (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name_en       text not null,
  name_mr       text,
  is_restricted boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,            -- PCFPT/EVT/2025-26/01
  slug        text unique,                     -- stable key used by the import mappings
  series      text,                            -- e.g. 'gaurav-sohala'
  name_en     text not null,
  name_mr     text,
  event_date  date,
  fy          text references fiscal_years(label),
  notes       text,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists schemes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,           -- PCFPT/SCH/01
  slug         text unique,
  name_en      text not null,
  name_mr      text,
  description  text,
  is_repayable boolean not null default false,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People: one identity for members, donors, beneficiaries, vendors, trustees
-- ---------------------------------------------------------------------------
create table if not exists people (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,    -- PCFPT/PER/000123
  name_en             text,
  name_mr             text,
  name_key            text,                    -- normalised, for matching
  phone               text,
  phone_alt           text,
  email               text,
  address             text,
  city                text,
  pincode             text,
  pan                 text,
  aadhaar             text,
  date_of_birth       date,
  date_of_anniversary date,
  blood_group         text,
  roles               text[] not null default '{}',   -- member | donor | beneficiary | vendor | trustee
  legacy_member_id    uuid references members(id) on delete set null,
  merged_into_id      uuid references people(id) on delete set null,
  notes               text,
  needs_review        boolean not null default false,
  origin              text not null default 'manual' check (origin in ('import', 'online', 'manual')),
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index if not exists idx_people_name_en_trgm on people using gin (name_en gin_trgm_ops);
create index if not exists idx_people_name_mr_trgm on people using gin (name_mr gin_trgm_ops);
create index if not exists idx_people_name_key on people (name_key);
create index if not exists idx_people_phone on people (phone);
create index if not exists idx_people_email on people (lower(email));
create index if not exists idx_people_pan on people (pan);

create table if not exists person_name_variants (
  id        bigserial primary key,
  person_id uuid not null references people(id) on delete cascade,
  name      text not null,
  source    text,
  unique (person_id, name)
);
create index if not exists idx_name_variants_trgm on person_name_variants using gin (name gin_trgm_ops);

create table if not exists person_merge_candidates (
  id          uuid primary key default gen_random_uuid(),
  person_a    uuid not null references people(id) on delete cascade,
  person_b    uuid not null references people(id) on delete cascade,
  score       numeric(5,2) not null,
  evidence    jsonb,
  status      text not null default 'open' check (status in ('open', 'merged', 'rejected')),
  decided_by  uuid,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (person_a, person_b)
);

-- Office bearers and committee (President, Secretary, Treasurer, Trustee ...).
create table if not exists trust_officers (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references people(id) on delete cascade,
  title_en      text not null,
  title_mr      text,
  from_date     date,
  to_date       date,                          -- null = currently serving
  display_order integer not null default 100,
  admin_user_id uuid,                          -- their login, when they have one
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_trust_officers_person on trust_officers (person_id);

-- ---------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------
create table if not exists memberships (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,  -- SLV/MEM/0001 | GLD/MEM/0001 | PLT/MEM/0001
  person_id             uuid not null references people(id) on delete cascade,
  tier                  text not null check (tier in ('silver', 'gold', 'platinum', 'other')),
  tier_as_written       text,
  start_date            date,
  expiry_date           date,                  -- null for lifetime
  dates_derived         boolean not null default false,
  date_rule             text,                  -- how start/expiry were derived, when they were
  validity_as_written   text,
  status                text not null default 'active' check (status in ('active', 'lapsed', 'discontinued', 'converted')),
  status_as_written     text,
  discontinued_on       date,
  discontinued_reason   text,
  legacy_member_id      uuid references members(id) on delete set null,
  notes                 text,
  needs_review          boolean not null default false,
  origin                text not null default 'manual' check (origin in ('import', 'online', 'manual')),
  import_batch_id       uuid references import_batches(id) on delete set null,
  content_fingerprint   text unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create index if not exists idx_memberships_person on memberships (person_id);
create index if not exists idx_memberships_expiry on memberships (expiry_date) where deleted_at is null;
create index if not exists idx_memberships_tier_status on memberships (tier, status);

-- Every number a membership has carried in the old registers (SM/24/173 ...).
create table if not exists membership_numbers (
  id                bigserial primary key,
  membership_id     uuid not null references memberships(id) on delete cascade,
  number_as_written text not null,
  first_seen_fy     text,
  last_seen_fy      text,
  is_current        boolean not null default false,
  unique (membership_id, number_as_written)
);
create index if not exists idx_membership_numbers_no on membership_numbers (number_as_written);

-- One row per person per yearly master sheet: reproducible growth-by-year.
create table if not exists membership_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  person_id           uuid references people(id) on delete cascade,
  membership_id       uuid references memberships(id) on delete set null,
  fy                  text not null,
  snapshot_label      text not null,
  tier                text,
  number_as_written   text,
  name_as_written     text,
  status_as_written   text,
  validity_as_written text,
  import_batch_id     uuid references import_batches(id) on delete set null,
  content_fingerprint text unique,
  created_at          timestamptz not null default now()
);
create index if not exists idx_membership_snapshots_fy on membership_snapshots (fy, tier);
