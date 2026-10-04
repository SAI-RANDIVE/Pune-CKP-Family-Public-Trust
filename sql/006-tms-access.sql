-- Migration 006: Trust Management System — access, audit detail, drafts and
-- fiscal-year seed. Extends the existing admin tables rather than replacing them.
-- Safe to re-run.

alter table admin_users add column if not exists username text;
alter table admin_users add column if not exists phone text;
alter table admin_users add column if not exists preferred_lang text not null default 'mr';
alter table admin_users add column if not exists text_scale integer not null default 100;
alter table admin_users add column if not exists person_id uuid references people(id) on delete set null;
create unique index if not exists idx_admin_users_username on admin_users (lower(username)) where username is not null;

-- Who / what / when already exist; add the before and after images of the record.
alter table audit_logs add column if not exists before jsonb;
alter table audit_logs add column if not exists after jsonb;
create index if not exists idx_audit_logs_entity on audit_logs (entity, entity_id);

-- OTPs now also guard sensitive management actions.
alter table email_otps add column if not exists admin_id uuid references admin_users(id) on delete cascade;
alter table email_otps add column if not exists action_ref text;
do $$
begin
  alter table email_otps drop constraint if exists email_otps_purpose_check;
  alter table email_otps add constraint email_otps_purpose_check
    check (purpose in ('payment', 'profile', 'admin_action'));
exception when others then null;
end $$;

-- Auto-saved, unfinished entry forms (one per user per form).
create table if not exists form_drafts (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references admin_users(id) on delete cascade,
  form_key   text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  unique (admin_id, form_key)
);

-- Indian financial years, April to March.
insert into fiscal_years (label, start_date, end_date)
select y::text || '-' || lpad(((y + 1) % 100)::text, 2, '0'),
       make_date(y, 4, 1),
       make_date(y + 1, 3, 31)
  from generate_series(2014, 2040) as y
on conflict (label) do nothing;
