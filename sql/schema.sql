-- Run this once in the Neon SQL editor (or via `npm run db:init`) before going live.
create extension if not exists pgcrypto;

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text not null,
  address text not null,
  pan_number text,
  blood_group text,
  date_of_birth date,
  date_of_anniversary date,
  membership_type text not null check (membership_type in ('silver', 'gold', 'platinum')),
  membership_no text unique,
  valid_from date not null,
  valid_till date, -- null for platinum (lifetime)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_members_email on members (email);
create index if not exists idx_members_phone on members (phone);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete set null,
  payment_kind text not null check (payment_kind in ('membership_new', 'membership_renew', 'donation')),
  membership_type text,                       -- silver / gold / platinum, null for donations
  amount numeric(10,2) not null,
  currency text not null default 'INR',
  razorpay_order_id text unique,
  razorpay_payment_id text,
  razorpay_signature text,
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  receipt_no text unique,
  receipt_file_name text,
  receipt_pdf bytea,
  receipt_generated_at timestamptz,
  towards text not null,                       -- free text shown on the receipt, e.g. "Membership Silver, New"
  valid_till date,                              -- membership validity printed on receipt
  membership_no text,                           -- membership number printed on receipt
  payer_name text not null,
  payer_phone text not null,
  payer_email text not null,
  payer_address text not null,
  amount_in_words text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_payments_status on payments (status);
create index if not exists idx_payments_member on payments (member_id);

create table if not exists receipt_counters (
  financial_year text primary key,   -- e.g. '26-27'
  last_seq integer not null default 0
);
