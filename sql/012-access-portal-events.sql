-- 012: finer access control, the members' portal, event registration and
-- media, the event budget planner, and bank verification of expenses.
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Who may see what. A role still sets the ceiling; `permissions` lets the
--    Chairman narrow (never widen) what one login can open:
--      { "areas": { "donations": "none" | "view" | "edit", ... },
--        "flags": { "seeIdNumbers": false, "export": false, "seeAmounts": false } }
--    An area that is not listed follows the role.
-- ---------------------------------------------------------------------------
alter table admin_users add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table admin_users add column if not exists designation text;

-- ---------------------------------------------------------------------------
-- 2. Expenses checked against the bank statements.
-- ---------------------------------------------------------------------------
create table if not exists expense_verifications (
  expense_id          uuid primary key references expenses(id) on delete cascade,
  status              text not null check (status in
                        ('matched', 'matched_group', 'ambiguous', 'unmatched', 'cash', 'no_statement')),
  bank_transaction_id uuid references bank_transactions(id) on delete set null,
  days_apart          integer,
  detail              text,
  checked_at          timestamptz not null default now()
);
create index if not exists expense_verifications_status_idx on expense_verifications (status);

-- ---------------------------------------------------------------------------
-- 3. Members' portal: one login per person, signed in with any of their IDs.
-- ---------------------------------------------------------------------------
create table if not exists member_accounts (
  id                   uuid primary key default gen_random_uuid(),
  person_id            uuid not null unique references people(id) on delete cascade,
  password_hash        text not null,
  must_change_password boolean not null default true,
  is_active            boolean not null default true,
  failed_attempts      integer not null default 0,
  locked_until         timestamptz,
  last_login_at        timestamptz,
  credentials_sent_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists member_sessions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references member_accounts(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists member_sessions_account_idx on member_sessions (account_id);

-- ---------------------------------------------------------------------------
-- 4. Events that members can see and register for.
-- ---------------------------------------------------------------------------
alter table events add column if not exists description_en text;
alter table events add column if not exists description_mr text;
alter table events add column if not exists venue text;
alter table events add column if not exists starts_at_text text;            -- "5:30 pm", as people say it
alter table events add column if not exists is_published boolean not null default false;
alter table events add column if not exists registration_open boolean not null default false;
alter table events add column if not exists registration_closes_on date;
alter table events add column if not exists members_only boolean not null default true;
alter table events add column if not exists fee numeric(14,2) not null default 0;
alter table events add column if not exists capacity integer;
alter table events add column if not exists created_by uuid references admin_users(id) on delete set null;
alter table events add column if not exists updated_at timestamptz not null default now();

create table if not exists event_registrations (
  id             uuid primary key default gen_random_uuid(),
  code           text unique,
  event_id       uuid not null references events(id) on delete cascade,
  person_id      uuid references people(id) on delete set null,
  name           text not null,
  phone          text,
  email          text,
  guests         integer not null default 0 check (guests between 0 and 20),
  amount_due     numeric(14,2) not null default 0,
  payment_status text not null default 'not_required'
                   check (payment_status in ('not_required', 'pending', 'paid', 'waived')),
  status         text not null default 'registered' check (status in ('registered', 'cancelled', 'attended')),
  notes          text,
  source         text not null default 'member' check (source in ('member', 'admin')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- One live registration per person per event.
create unique index if not exists event_registrations_person_uidx
  on event_registrations (event_id, person_id) where person_id is not null and status <> 'cancelled';
create index if not exists event_registrations_event_idx on event_registrations (event_id);

-- Banners and photographs, kept in the database so they work on any host.
create table if not exists event_media (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  kind        text not null check (kind in ('banner', 'photo')),
  mime        text not null,
  size_bytes  integer not null,
  content     bytea not null,
  caption     text,
  is_public   boolean not null default true,
  sort_order  integer not null default 0,
  uploaded_by uuid references admin_users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists event_media_event_idx on event_media (event_id, kind, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- 5. Event budget planner: what an event is expected to bring in and cost.
-- ---------------------------------------------------------------------------
create table if not exists event_plans (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique,
  event_id           uuid references events(id) on delete set null,
  title              text not null,
  expected_attendees integer not null default 0,
  entry_fee          numeric(14,2) not null default 0,
  notes              text,
  created_by         uuid references admin_users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create table if not exists event_plan_items (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references event_plans(id) on delete cascade,
  kind        text not null check (kind in ('income', 'expense')),
  label       text not null,
  qty         numeric(12,2) not null default 1,
  unit_amount numeric(14,2) not null default 0,
  per_head    boolean not null default false,      -- multiply by the expected attendees
  sort_order  integer not null default 0
);
create index if not exists event_plan_items_plan_idx on event_plan_items (plan_id, sort_order);

-- ---------------------------------------------------------------------------
-- 6. One number that changes whenever anything a visitor can see changes, so
--    open pages can refresh themselves.
-- ---------------------------------------------------------------------------
create table if not exists live_state (
  topic      text primary key,
  version    bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into live_state (topic) values ('events') on conflict do nothing;
