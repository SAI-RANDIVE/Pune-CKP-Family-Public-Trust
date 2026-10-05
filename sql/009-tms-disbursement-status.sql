-- Migration 009: a scheme amount can be a plan rather than money paid.
-- The archive's utilisation summary lists "upcoming" projects beside real
-- payments; they are kept, but must never be counted as disbursed.
-- Safe to re-run.

alter table scheme_disbursements add column if not exists status text not null default 'paid';
do $$
begin
  alter table scheme_disbursements drop constraint if exists scheme_disbursements_status_check;
  alter table scheme_disbursements add constraint scheme_disbursements_status_check
    check (status in ('paid', 'planned', 'cancelled'));
exception when others then null;
end $$;

create or replace view v_scheme_totals as
select s.id as scheme_id, s.code, s.name_en, s.name_mr, d.fy,
       count(d.id) filter (where d.status = 'paid') as disbursements,
       coalesce(sum(coalesce(d.beneficiary_count, 1)) filter (where d.status = 'paid'), 0) as beneficiaries,
       coalesce(sum(d.amount) filter (where d.status = 'paid'), 0) as disbursed,
       coalesce(sum(d.amount) filter (where d.status = 'planned'), 0) as planned
  from schemes s
  left join scheme_disbursements d on d.scheme_id = s.id and d.deleted_at is null
 group by s.id, s.code, s.name_en, s.name_mr, d.fy;

create or replace view v_public_impact as
select
  (select count(*) from memberships where deleted_at is null and status = 'active') as active_members,
  (select count(distinct person_id) from income_entries
     where deleted_at is null and kind = 'donation' and person_id is not null) as donors,
  (select coalesce(sum(coalesce(beneficiary_count, 1)), 0) from scheme_disbursements
     where deleted_at is null and status = 'paid') as beneficiaries_supported,
  (select coalesce(sum(amount), 0) from scheme_disbursements
     where deleted_at is null and status = 'paid') as welfare_disbursed,
  (select count(*) from events where deleted_at is null) as events_held,
  (select extract(year from age(current_date, date '2018-05-14'))::int) as years_of_service;
