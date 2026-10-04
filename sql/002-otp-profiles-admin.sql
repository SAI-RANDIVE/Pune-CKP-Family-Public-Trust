-- Migration 002: email OTP verification, member profiles, payment audit trail,
-- and admin authentication. Safe to re-run (everything is IF NOT EXISTS).
--
-- Run with:  npm run db:migrate

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Email OTP verification (before payment)
-- ---------------------------------------------------------------------------
create table if not exists email_otps (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  otp_hash      text not null,               -- sha256(otp + pepper); never store the raw code
  purpose       text not null default 'payment' check (purpose in ('payment', 'profile')),
  attempts      integer not null default 0,
  max_attempts  integer not null default 5,
  consumed_at   timestamptz,                 -- set when exchanged for a verification
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  ip            text
);

create index if not exists idx_email_otps_lookup on email_otps (email, purpose, created_at desc);
create index if not exists idx_email_otps_expiry on email_otps (expires_at);

-- A successful OTP check produces a short-lived verification the payment binds to.
create table if not exists email_verifications (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  token       text not null unique,          -- opaque; the browser holds this
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_email_verifications_token on email_verifications (token);

-- ---------------------------------------------------------------------------
-- Bind payments to a verified email
-- ---------------------------------------------------------------------------
alter table payments add column if not exists email_verified boolean not null default false;
alter table payments add column if not exists verification_id uuid references email_verifications(id);
alter table payments add column if not exists failure_reason text;
alter table payments add column if not exists refunded_at timestamptz;

-- The original schema only allowed created/paid/failed. Add refund states.
do $$
begin
  alter table payments drop constraint if exists payments_status_check;
  alter table payments add constraint payments_status_check
    check (status in ('created', 'paid', 'failed', 'refunded', 'partially_refunded'));
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- Member profile
-- ---------------------------------------------------------------------------
alter table members add column if not exists email_verified boolean not null default false;
alter table members add column if not exists profile_token text;
alter table members add column if not exists last_seen_at timestamptz;
alter table members add column if not exists notes text;

create unique index if not exists idx_members_profile_token on members (profile_token) where profile_token is not null;

-- Backfill a stable profile token for any member that predates this migration.
update members set profile_token = encode(gen_random_bytes(24), 'hex') where profile_token is null;

-- ---------------------------------------------------------------------------
-- Payment event audit trail — the reconciliation record, independent of the
-- Razorpay dashboard. Idempotent on (event_id) so webhook replays are safe.
-- ---------------------------------------------------------------------------
create table if not exists payment_events (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid references payments(id) on delete set null,
  event_id            text unique,           -- Razorpay's event id, when it comes from a webhook
  event_type          text not null,         -- created | captured | failed | refunded | receipt_emailed ...
  source              text not null default 'server' check (source in ('server', 'webhook', 'admin')),
  razorpay_order_id   text,
  razorpay_payment_id text,
  amount              numeric(10,2),
  payload             jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists idx_payment_events_payment on payment_events (payment_id, created_at desc);
create index if not exists idx_payment_events_type on payment_events (event_type);

-- ---------------------------------------------------------------------------
-- Receipt delivery log
-- ---------------------------------------------------------------------------
create table if not exists receipt_emails (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references payments(id) on delete cascade,
  to_email    text not null,
  status      text not null check (status in ('sent', 'failed')),
  error       text,
  sent_at     timestamptz not null default now()
);

create index if not exists idx_receipt_emails_payment on receipt_emails (payment_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- Admin authentication + action audit
-- ---------------------------------------------------------------------------
create table if not exists admin_users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  name            text not null,
  password_hash   text not null,             -- scrypt
  role            text not null default 'viewer' check (role in ('super_admin', 'admin', 'accountant', 'viewer')),
  is_active       boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists admin_sessions (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references admin_users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_admin_sessions_token on admin_sessions (token_hash);
create index if not exists idx_admin_sessions_expiry on admin_sessions (expires_at);

create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references admin_users(id) on delete set null,
  admin_email text,
  action      text not null,
  entity      text,
  entity_id   text,
  detail      jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_logs_created on audit_logs (created_at desc);
create index if not exists idx_audit_logs_admin on audit_logs (admin_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Simple rate limiting, keyed by action + identifier (ip or email)
-- ---------------------------------------------------------------------------
create table if not exists rate_limits (
  bucket      text primary key,              -- e.g. 'otp:send:1.2.3.4'
  count       integer not null default 0,
  window_start timestamptz not null default now()
);
