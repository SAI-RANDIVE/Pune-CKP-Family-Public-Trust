-- Migration 003: receipt storage columns.
--
-- Why this is needed: sql/schema.sql declares receipt_pdf / receipt_file_name /
-- receipt_generated_at inside `create table if not exists payments (...)`. On a
-- database where `payments` already existed, that statement is a NO-OP — it does
-- not add missing columns. The live database therefore never had these columns,
-- and every receipt download failed with:
--     column "receipt_pdf" of relation "payments" does not exist
--
-- Lesson for future changes: never add a column by editing schema.sql alone.
-- Always add an explicit `alter table ... add column if not exists` migration.

alter table payments add column if not exists receipt_pdf bytea;
alter table payments add column if not exists receipt_file_name text;
alter table payments add column if not exists receipt_generated_at timestamptz;

-- Backfill defences for anything else schema.sql assumes but an older database
-- may predate. All no-ops where the column already exists.
alter table payments add column if not exists amount_in_words text;
alter table payments add column if not exists membership_no text;
alter table payments add column if not exists valid_till date;

alter table members add column if not exists pan_number text;
alter table members add column if not exists blood_group text;
alter table members add column if not exists date_of_birth date;
alter table members add column if not exists date_of_anniversary date;

create index if not exists idx_payments_receipt_no on payments (receipt_no);
create index if not exists idx_payments_created on payments (created_at desc);
create index if not exists idx_payments_order on payments (razorpay_order_id);
create index if not exists idx_members_membership_no on members (membership_no);
