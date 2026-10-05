-- Migration 011: tell Razorpay test-mode payments apart from real money.
-- The site has only ever run on test keys, so every payment row that exists
-- when this migration first runs is a test payment. Test payments stay in the
-- table (they prove the checkout works) but are excluded from trust income.
-- Safe to re-run: the backfill runs only when the column is first added.

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'payments' and column_name = 'is_test') then
    alter table payments add column is_test boolean not null default false;
    update payments set is_test = true;
  end if;
end $$;

create or replace view v_income as
select i.id, i.code, i.entry_date, i.fy, i.cal_year, i.cal_month, i.amount, i.kind,
       i.person_id, i.payer_as_written, i.mode, i.event_id, i.scheme_id, i.fund_id, i.category_id,
       i.origin
  from income_entries i
 where i.deleted_at is null
   and i.kind not in ('loan_received', 'refund_received')
union all
-- Real online payments that the management system has not yet mirrored.
select p.id, p.receipt_no, p.paid_at::date,
       fy.label, extract(year from p.paid_at)::int, extract(month from p.paid_at)::int,
       p.amount,
       case when p.payment_kind = 'donation' then 'donation' else 'membership_fee' end,
       null::uuid, p.payer_name, 'online', null::uuid, null::uuid, null::uuid, null::uuid,
       'online'
  from payments p
  left join fiscal_years fy on p.paid_at::date between fy.start_date and fy.end_date
 where p.status = 'paid'
   and p.is_test = false
   and not exists (select 1 from receipts r where r.payment_id = p.id and r.deleted_at is null);
