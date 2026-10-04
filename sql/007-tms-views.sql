-- Migration 007: Trust Management System — reporting views.
-- Views are replaced on every run, so this file is safe to re-run.

-- Real income: everything in income_entries except money that is not income
-- (loans received and refunds of the trust's own payments are shown separately).
create or replace view v_income as
select i.id, i.code, i.entry_date, i.fy, i.cal_year, i.cal_month, i.amount, i.kind,
       i.person_id, i.payer_as_written, i.mode, i.event_id, i.scheme_id, i.fund_id, i.category_id,
       i.origin
  from income_entries i
 where i.deleted_at is null
   and i.kind not in ('loan_received', 'refund_received')
union all
-- Online Razorpay payments that the management system has not yet mirrored.
select p.id, p.receipt_no, p.paid_at::date,
       fy.label, extract(year from p.paid_at)::int, extract(month from p.paid_at)::int,
       p.amount,
       case when p.payment_kind = 'donation' then 'donation' else 'membership_fee' end,
       null::uuid, p.payer_name, 'online', null::uuid, null::uuid, null::uuid, null::uuid,
       'online'
  from payments p
  left join fiscal_years fy on p.paid_at::date between fy.start_date and fy.end_date
 where p.status = 'paid'
   and not exists (select 1 from receipts r where r.payment_id = p.id and r.deleted_at is null);

create or replace view v_donations as
select * from v_income where kind in ('donation', 'csr_grant', 'sponsorship');

create or replace view v_income_by_fy_kind as
select fy, kind, count(*) as entries, sum(amount) as total
  from v_income group by fy, kind;

create or replace view v_expense_by_fy_category as
select e.fy, coalesce(c.name_en, e.head_as_written, 'Uncategorised') as category,
       c.name_mr as category_mr, count(*) as entries, sum(e.amount) as total
  from expenses e left join categories c on c.id = e.category_id
 where e.deleted_at is null
 group by e.fy, coalesce(c.name_en, e.head_as_written, 'Uncategorised'), c.name_mr;

create or replace view v_income_vs_expense_by_fy as
select f.label as fy,
       coalesce(i.total, 0) as income,
       coalesce(x.total, 0) as expense,
       coalesce(i.total, 0) - coalesce(x.total, 0) as surplus
  from fiscal_years f
  left join (select fy, sum(amount) as total from v_income group by fy) i on i.fy = f.label
  left join (select fy, sum(amount) as total from expenses where deleted_at is null group by fy) x on x.fy = f.label
 where i.total is not null or x.total is not null;

create or replace view v_income_vs_expense_by_month as
select fy, cal_year, cal_month, sum(income) as income, sum(expense) as expense
  from (
    select fy, cal_year, cal_month, amount as income, 0::numeric as expense from v_income
    union all
    select fy, cal_year, cal_month, 0::numeric, amount from expenses where deleted_at is null
  ) t
 group by fy, cal_year, cal_month;

-- Per event: the organisers' own accounts (event_account_lines) beside what the
-- trust's main books show tagged to the same event. The two are different
-- records of the same money and are shown side by side, never added together.
create or replace view v_event_accounts as
select ev.id as event_id, ev.code, ev.name_en, ev.name_mr, ev.event_date, ev.fy,
       coalesce(l.income, 0) as event_income,
       coalesce(l.expense, 0) as event_expense,
       coalesce(l.income, 0) - coalesce(l.expense, 0) as event_net,
       coalesce(i.total, 0) as books_income,
       coalesce(x.total, 0) as books_expense
  from events ev
  left join (select event_id,
                    sum(amount) filter (where side = 'income') as income,
                    sum(amount) filter (where side = 'expense') as expense
               from event_account_lines where deleted_at is null group by event_id) l on l.event_id = ev.id
  left join (select event_id, sum(amount) as total from income_entries
              where deleted_at is null group by event_id) i on i.event_id = ev.id
  left join (select event_id, sum(amount) as total from expenses
              where deleted_at is null group by event_id) x on x.event_id = ev.id
 where ev.deleted_at is null;

create or replace view v_scheme_totals as
select s.id as scheme_id, s.code, s.name_en, s.name_mr, d.fy,
       count(d.id) as disbursements,
       coalesce(sum(d.beneficiary_count), count(d.person_id)) as beneficiaries,
       coalesce(sum(d.amount), 0) as disbursed
  from schemes s
  left join scheme_disbursements d on d.scheme_id = s.id and d.deleted_at is null
 group by s.id, s.code, s.name_en, s.name_mr, d.fy;

create or replace view v_donor_lifetime as
select p.id as person_id, p.code, p.name_en, p.name_mr,
       count(*) as gifts, sum(i.amount) as total_given,
       min(i.entry_date) as first_gift, max(i.entry_date) as last_gift,
       count(distinct i.fy) as years_active
  from income_entries i join people p on p.id = i.person_id
 where i.deleted_at is null and i.kind in ('donation', 'csr_grant', 'sponsorship')
 group by p.id, p.code, p.name_en, p.name_mr;

create or replace view v_membership_expiries_due as
select m.id, m.code, m.tier, m.expiry_date, m.status, m.dates_derived,
       p.code as person_code, p.name_en, p.name_mr, p.phone, p.email,
       (m.expiry_date - current_date) as days_left
  from memberships m join people p on p.id = m.person_id
 where m.deleted_at is null and m.expiry_date is not null
   and m.status in ('active', 'lapsed')
   and m.expiry_date <= current_date + 90;

create or replace view v_fd_maturity_calendar as
select id, code, bank, fd_number, principal, rate_pct, start_date, maturity_date, maturity_amount, status,
       (maturity_date - current_date) as days_to_maturity
  from fixed_deposits
 where deleted_at is null and status in ('active', 'unknown');

create or replace view v_fd_interest_by_fy as
select fy, kind, count(*) as entries, sum(amount) as total
  from fd_events where deleted_at is null group by fy, kind;

create or replace view v_review_queue_summary as
select kind, severity, status, count(*) as items
  from import_review_queue group by kind, severity, status;

-- Privacy-safe aggregates for the public home page. Counts and totals only.
create or replace view v_public_impact as
select
  (select count(*) from memberships where deleted_at is null and status = 'active') as active_members,
  (select count(distinct person_id) from income_entries
     where deleted_at is null and kind = 'donation' and person_id is not null) as donors,
  (select coalesce(sum(coalesce(beneficiary_count, 1)), 0) from scheme_disbursements
     where deleted_at is null) as beneficiaries_supported,
  (select coalesce(sum(amount), 0) from scheme_disbursements where deleted_at is null) as welfare_disbursed,
  (select count(*) from events where deleted_at is null) as events_held,
  (select extract(year from age(current_date, date '2018-05-14'))::int) as years_of_service;
