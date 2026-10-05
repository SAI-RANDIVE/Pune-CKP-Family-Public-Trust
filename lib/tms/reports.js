import { q, one } from './db';
import { pick } from './format';

/**
 * The reports. Each builder returns plain data:
 *   { slug, title, notes: [text], sections: [{ title, columns, rows, total, chart, note }] }
 * which the report page renders as tables and labelled bars, and the export
 * route writes to Excel, so screen, print and spreadsheet always agree.
 *
 * Column types: text | money | num | date | pct.
 * Online test payments are never counted (v_income already excludes
 * payments.is_test) and planned scheme amounts are never shown as paid.
 */

export const REPORT_SLUGS = ['income-expense', 'income-kind', 'expense-category', 'donors', 'membership', 'schemes', 'deposits', 'banks'];

const FY = `($1::text = 'all' or fy = $1)`;
const sum = (rows, key) => rows.reduce((acc, r) => acc + Number(r[key] || 0), 0);

async function incomeExpense(fy, { t }) {
  const byFy = await q('select fy, income, expense, surplus from v_income_vs_expense_by_fy order by fy');
  const sections = [{
    title: t('rep.s.by_fy'),
    columns: [
      { key: 'fy', label: t('f.fy'), type: 'text' },
      { key: 'income', label: t('rep.c.income'), type: 'money' },
      { key: 'expense', label: t('rep.c.expense'), type: 'money' },
      { key: 'surplus', label: t('rep.c.surplus'), type: 'money' },
    ],
    rows: byFy,
    chart: { label: 'fy', series: [{ key: 'income', label: t('rep.c.income') }, { key: 'expense', label: t('rep.c.expense') }] },
  }];
  if (fy !== 'all') {
    const months = await q(
      `select cal_year, cal_month, income, expense from v_income_vs_expense_by_month
        where fy = $1 and cal_month is not null order by cal_year, cal_month`, [fy]);
    const rows = months.map((m) => ({
      month: `${t(`month.${m.cal_month}`)} ${m.cal_year}`, income: m.income, expense: m.expense,
      surplus: Number(m.income) - Number(m.expense),
    }));
    sections.push({
      title: t('rep.s.by_month', { fy }),
      columns: [
        { key: 'month', label: t('rep.c.month'), type: 'text' },
        { key: 'income', label: t('rep.c.income'), type: 'money' },
        { key: 'expense', label: t('rep.c.expense'), type: 'money' },
        { key: 'surplus', label: t('rep.c.surplus'), type: 'money' },
      ],
      rows,
      total: { month: t('c.total'), income: sum(rows, 'income'), expense: sum(rows, 'expense'), surplus: sum(rows, 'surplus') },
      chart: { label: 'month', series: [{ key: 'income', label: t('rep.c.income') }, { key: 'expense', label: t('rep.c.expense') }] },
    });
  }
  const pending = await one(
    `select (select count(*) from income_entries where deleted_at is null and needs_review and ${FY})::int as income,
            (select count(*) from expenses where deleted_at is null and needs_review and ${FY})::int as expense`, [fy]);
  const notes = [t('rep.n.transfers')];
  if (pending.income || pending.expense) notes.push(t('rep.n.pending', { income: pending.income, expense: pending.expense }));
  return { sections, notes };
}

async function incomeKind(fy, { t }) {
  const raw = await q(
    `select kind, sum(entries)::int as entries, sum(total) as total from v_income_by_fy_kind
      where ${FY} group by kind order by sum(total) desc`, [fy]);
  const rows = raw.map((r) => ({ ...r, kind_label: t(`kind.${r.kind}`) }));
  return {
    sections: [{
      title: t('rep.s.income_kind'),
      columns: [
        { key: 'kind_label', label: t('f.kind'), type: 'text' },
        { key: 'entries', label: t('rep.c.entries'), type: 'num' },
        { key: 'total', label: t('f.amount'), type: 'money' },
      ],
      rows,
      total: { kind_label: t('c.total'), entries: sum(rows, 'entries'), total: sum(rows, 'total') },
      chart: { label: 'kind_label', series: [{ key: 'total', label: t('f.amount') }] },
    }],
    notes: [],
  };
}

async function expenseCategory(fy, { t, lang }) {
  const raw = await q(
    `select category, max(category_mr) as category_mr, sum(entries)::int as entries, sum(total) as total
       from v_expense_by_fy_category where ${FY} group by category order by sum(total) desc`, [fy]);
  const rows = raw.map((r) => ({ ...r, name: pick(lang, r.category_mr, r.category) }));
  return {
    sections: [{
      title: t('rep.s.expense_category'),
      columns: [
        { key: 'name', label: t('f.category'), type: 'text' },
        { key: 'entries', label: t('rep.c.entries'), type: 'num' },
        { key: 'total', label: t('f.amount'), type: 'money' },
      ],
      rows,
      total: { name: t('c.total'), entries: sum(rows, 'entries'), total: sum(rows, 'total') },
      chart: { label: 'name', series: [{ key: 'total', label: t('f.amount') }] },
    }],
    notes: [],
  };
}

async function donors(fy, { t, lang }) {
  const top = await q(
    `select p.code, p.name_en, p.name_mr, count(*)::int as gifts, sum(i.amount) as total, max(i.entry_date) as last_gift
       from income_entries i join people p on p.id = i.person_id
      where i.deleted_at is null and i.kind in ('donation', 'csr_grant', 'sponsorship') and ($1::text = 'all' or i.fy = $1)
      group by p.id, p.code, p.name_en, p.name_mr
      order by sum(i.amount) desc limit 25`, [fy]);
  const life = await one(
    `select count(*) filter (where gifts > 1)::int as repeat_n, coalesce(sum(total_given) filter (where gifts > 1), 0) as repeat_total,
            count(*) filter (where gifts = 1)::int as once_n, coalesce(sum(total_given) filter (where gifts = 1), 0) as once_total
       from v_donor_lifetime`);
  const unnamed = await one(
    `select count(*)::int as n, coalesce(sum(amount), 0) as total from income_entries i
      where i.deleted_at is null and i.kind in ('donation', 'csr_grant', 'sponsorship') and i.person_id is null
        and ($1::text = 'all' or i.fy = $1)`, [fy]);
  const topRows = top.map((r, i) => ({ rank: i + 1, name: pick(lang, r.name_mr, r.name_en), ...r }));
  const split = [
    { group: t('rep.c.repeat'), donors: life.repeat_n, total: life.repeat_total },
    { group: t('rep.c.once'), donors: life.once_n, total: life.once_total },
  ];
  return {
    sections: [{
      title: t('rep.s.top_donors'),
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'name', label: t('f.name'), type: 'text' },
        { key: 'code', label: t('f.id'), type: 'text' },
        { key: 'gifts', label: t('rep.c.gifts'), type: 'num' },
        { key: 'total', label: t('f.amount'), type: 'money' },
        { key: 'last_gift', label: t('rep.c.last_gift'), type: 'date' },
      ],
      rows: topRows,
      note: unnamed.n ? t('rep.n.unnamed', { n: unnamed.n }) : null,
    }, {
      title: t('rep.s.repeat'),
      columns: [
        { key: 'group', label: t('rep.c.group'), type: 'text' },
        { key: 'donors', label: t('rep.c.donors'), type: 'num' },
        { key: 'total', label: t('f.amount'), type: 'money' },
      ],
      rows: split,
      chart: { label: 'group', series: [{ key: 'donors', label: t('rep.c.donors'), type: 'num' }] },
    }],
    notes: [],
  };
}

async function membership(fy, { t }) {
  const raw = await q(
    `select tier, status, count(*)::int as n from memberships where deleted_at is null group by tier, status order by tier, status`);
  const tiers = ['silver', 'gold', 'platinum', 'other'].filter((x) => raw.some((r) => r.tier === x));
  const rows = tiers.map((tier) => {
    const get = (status) => raw.find((r) => r.tier === tier && r.status === status)?.n || 0;
    const row = { tier: t(`tier.${tier}`), active: get('active'), lapsed: get('lapsed'), discontinued: get('discontinued'), converted: get('converted') };
    row.total = row.active + row.lapsed + row.discontinued + row.converted;
    return row;
  });
  const sections = [{
    title: t('rep.s.membership'),
    columns: [
      { key: 'tier', label: t('f.tier'), type: 'text' },
      { key: 'active', label: t('status.active'), type: 'num' },
      { key: 'lapsed', label: t('status.lapsed'), type: 'num' },
      { key: 'discontinued', label: t('status.discontinued'), type: 'num' },
      { key: 'converted', label: t('status.converted'), type: 'num' },
      { key: 'total', label: t('c.total'), type: 'num' },
    ],
    rows,
    total: { tier: t('c.total'), active: sum(rows, 'active'), lapsed: sum(rows, 'lapsed'), discontinued: sum(rows, 'discontinued'), converted: sum(rows, 'converted'), total: sum(rows, 'total') },
    chart: { label: 'tier', series: [{ key: 'active', label: t('status.active'), type: 'num' }] },
  }];
  const fees = await q(
    `select fy, sum(entries)::int as entries, sum(total) as total from v_income_by_fy_kind
      where kind = 'membership_fee' and ${FY} group by fy order by fy`, [fy]);
  sections.push({
    title: t('rep.s.membership_fees'),
    columns: [
      { key: 'fy', label: t('f.fy'), type: 'text' },
      { key: 'entries', label: t('rep.c.entries'), type: 'num' },
      { key: 'total', label: t('f.amount'), type: 'money' },
    ],
    rows: fees,
  });
  return { sections, notes: [t('rep.n.membership_today')] };
}

async function schemes(fy, { t, lang }) {
  const raw = await q(
    `select code, name_en, name_mr, sum(disbursements)::int as disbursements, sum(beneficiaries)::int as beneficiaries,
            sum(disbursed) as disbursed, sum(planned) as planned
       from v_scheme_totals where ($1::text = 'all' or fy = $1 or fy is null)
      group by code, name_en, name_mr order by code`, [fy]);
  const rows = raw.map((r) => ({ ...r, name: pick(lang, r.name_mr, r.name_en) }));
  return {
    sections: [{
      title: t('rep.s.schemes'),
      columns: [
        { key: 'code', label: t('f.id'), type: 'text' },
        { key: 'name', label: t('f.scheme'), type: 'text' },
        { key: 'disbursements', label: t('rep.c.payments'), type: 'num' },
        { key: 'beneficiaries', label: t('rep.c.beneficiaries'), type: 'num' },
        { key: 'disbursed', label: t('sch.paid'), type: 'money' },
        { key: 'planned', label: t('sch.planned'), type: 'money' },
      ],
      rows,
      total: { code: '', name: t('c.total'), disbursements: sum(rows, 'disbursements'), beneficiaries: sum(rows, 'beneficiaries'), disbursed: sum(rows, 'disbursed'), planned: sum(rows, 'planned') },
      chart: { label: 'name', series: [{ key: 'disbursed', label: t('sch.paid') }] },
    }],
    notes: [t('rep.n.planned')],
  };
}

async function deposits(fy, { t }) {
  const raw = await q(
    `select code, bank, fd_number, principal, rate_pct, start_date, maturity_date, maturity_amount, status
       from fixed_deposits where deleted_at is null and status in ('active', 'unknown')
      order by maturity_date nulls last`);
  const rows = raw.map((r) => ({ ...r, status_label: t(`fdstatus.${r.status}`) }));
  const events = await q(
    `select fy, coalesce(sum(total) filter (where kind = 'interest'), 0) as interest,
            coalesce(sum(total) filter (where kind = 'tds'), 0) as tds
       from v_fd_interest_by_fy where fy is not null and ${FY} group by fy order by fy`, [fy]);
  const interest = events.map((e) => ({ ...e, net: Number(e.interest) - Number(e.tds) }));
  return {
    sections: [{
      title: t('rep.s.fd_portfolio'),
      columns: [
        { key: 'code', label: t('f.id'), type: 'text' },
        { key: 'bank', label: t('f.bank'), type: 'text' },
        { key: 'fd_number', label: t('fd.number'), type: 'text' },
        { key: 'principal', label: t('fd.principal'), type: 'money' },
        { key: 'rate_pct', label: t('fd.rate'), type: 'pct' },
        { key: 'start_date', label: t('fd.start'), type: 'date' },
        { key: 'maturity_date', label: t('fd.maturity'), type: 'date' },
        { key: 'maturity_amount', label: t('fd.maturity_amount'), type: 'money' },
        { key: 'status_label', label: t('f.status'), type: 'text' },
      ],
      rows,
      total: { code: '', bank: t('c.total'), fd_number: '', principal: sum(rows, 'principal'), rate_pct: '', start_date: '', maturity_date: '', maturity_amount: sum(rows, 'maturity_amount'), status_label: '' },
    }, {
      title: t('rep.s.fd_interest'),
      columns: [
        { key: 'fy', label: t('f.fy'), type: 'text' },
        { key: 'interest', label: t('fd.interest'), type: 'money' },
        { key: 'tds', label: t('fd.tds'), type: 'money' },
        { key: 'net', label: t('rep.c.net'), type: 'money' },
      ],
      rows: interest,
      total: { fy: t('c.total'), interest: sum(interest, 'interest'), tds: sum(interest, 'tds'), net: sum(interest, 'net') },
      chart: { label: 'fy', series: [{ key: 'interest', label: t('fd.interest') }] },
    }],
    notes: [t('rep.n.fd_today')],
  };
}

async function banks(fy, { t }) {
  const rows = await q(
    `select b.code, b.bank, b.number_masked, last.balance, last.txn_date as balance_date,
            coalesce(tot.credit, 0) as credit, coalesce(tot.debit, 0) as debit, coalesce(tot.n, 0)::int as entries
       from bank_accounts b
       left join lateral (
         select balance, txn_date from bank_transactions x
          where x.bank_account_id = b.id and x.deleted_at is null and x.balance is not null
          order by x.txn_date desc nulls last, x.seq_in_statement desc nulls last limit 1) last on true
       left join lateral (
         select sum(credit) as credit, sum(debit) as debit, count(*) as n from bank_transactions x
          where x.bank_account_id = b.id and x.deleted_at is null and ($1::text = 'all' or x.fy = $1)) tot on true
      order by b.code`, [fy]);
  return {
    sections: [{
      title: t('rep.s.banks'),
      columns: [
        { key: 'code', label: t('f.id'), type: 'text' },
        { key: 'bank', label: t('f.bank'), type: 'text' },
        { key: 'number_masked', label: t('rep.c.account_no'), type: 'text' },
        { key: 'entries', label: t('rep.c.entries'), type: 'num' },
        { key: 'credit', label: t('rep.c.credit'), type: 'money' },
        { key: 'debit', label: t('rep.c.debit'), type: 'money' },
        { key: 'balance', label: t('rep.c.balance'), type: 'money' },
        { key: 'balance_date', label: t('rep.c.balance_date'), type: 'date' },
      ],
      rows,
    }],
    notes: [t('rep.n.banks')],
  };
}

const BUILDERS = {
  'income-expense': incomeExpense, 'income-kind': incomeKind, 'expense-category': expenseCategory,
  donors, membership, schemes, deposits, banks,
};

/** @param fy a financial-year label or 'all' */
export async function buildReport(slug, fy, ctx) {
  const builder = BUILDERS[slug];
  if (!builder) return null;
  const body = await builder(fy, ctx);
  return { slug, title: ctx.t(`rep.${slug}`), fy, ...body };
}
