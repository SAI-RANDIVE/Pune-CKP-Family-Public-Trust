import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { DataTable, FilterForm, Flash, OriginBadges, PageHead, Pager } from '../../../../components/tms/blocks';
import { Empty, Money, SelectField, Stat, TextField } from '../../../../components/tms/ui';
import { requireRole, can } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { PAGE_SIZE, Where, isUuid, likeParam, oneOf, one, pageOf, q, textParam } from '../../../../lib/tms/db';
import { currentFy, fmtDate, formatINR, formatNumber, isFyLabel, pick } from '../../../../lib/tms/format';
import { getEvents, getFiscalYears, options } from '../../../../lib/tms/lookups';
import { MODES } from '../../../../lib/tms/schemas';

export const dynamic = 'force-dynamic';

const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/** Payment vouchers, with filters. */
export default async function ExpensesPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  const mayEnter = can(admin, 'enterMoney');

  const fyParam = String(searchParams?.fy ?? '');
  const fy = fyParam === 'all' ? 'all' : (isFyLabel(fyParam) ? fyParam : currentFy());
  const category = isUuid(searchParams?.category) ? searchParams.category : '';
  const mode = oneOf(searchParams?.mode, MODES);
  const event = isUuid(searchParams?.event) ? searchParams.event : '';
  const from = isIso(searchParams?.from) ? searchParams.from : '';
  const to = isIso(searchParams?.to) ? searchParams.to : '';
  const term = textParam(searchParams?.q, 80);
  const page = pageOf(searchParams);

  const w = new Where(['e.deleted_at is null']);
  if (fy !== 'all') w.add('e.fy = ?', fy);
  if (category) w.add('e.category_id = ?', category);
  if (mode) w.add('e.mode = ?', mode);
  if (event) w.add('e.event_id = ?', event);
  if (from) w.add('e.entry_date >= ?', from);
  if (to) w.add('e.entry_date <= ?', to);
  if (term) {
    const like = w.param(likeParam(term));
    w.conds.push(`(e.payee_as_written ilike ${like} or e.particulars ilike ${like} or e.code ilike ${like} or e.voucher_no_as_written ilike ${like} or e.cheque_no ilike ${like})`);
  }

  const [fys, events, categories, sum, rows] = await Promise.all([
    getFiscalYears(currentFy()),
    getEvents(),
    q("select id, name_en, name_mr from categories where kind = 'expense' order by name_en"),
    one(`select count(*)::int as n, coalesce(sum(e.amount), 0) as total, count(*) filter (where e.needs_review)::int as pending from expenses e ${w.sql}`, w.params),
    q(`select e.id, e.code, e.entry_date, e.amount, e.payee_as_written, e.particulars, e.mode, e.voucher_no_as_written, e.origin, e.needs_review,
              e.head_as_written, c.name_en as cat_en, c.name_mr as cat_mr
         from expenses e left join categories c on c.id = e.category_id ${w.sql}
        order by e.entry_date desc nulls last, e.created_at desc, e.id
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, w.params),
  ]);

  return (
    <>
      <PageHead title={t('exp.title')} intro={t('exp.intro')} crumbs={[{ label: t('exp.title') }]}>
        {mayEnter && <Link href="/expenses/new" className="tms-btn tms-btn--big"><Icon name="plus" />{t('tile.expense')}</Link>}
        <Link href={`/expenses/ledger?fy=${fy === 'all' ? currentFy() : fy}`} className="tms-btn tms-btn--secondary">{t('led.title')}</Link>
        <Link href="/transfers" className="tms-btn tms-btn--secondary">{t('trf.title')}</Link>
      </PageHead>
      <Flash searchParams={searchParams} />

      <div className="tms-grid tms-grid--3" style={{ marginBottom: '1.25rem' }}>
        <Stat label={t('exp.sum')} value={formatINR(sum.total)} note={t('dash.vouchers', { n: formatNumber(sum.n) })} />
        {sum.pending > 0 && <Stat label={t('c.needs_review')} value={formatNumber(sum.pending)} note={t('inc.pending_note')} />}
      </div>

      <FilterForm action="/expenses">
        <SelectField label={t('f.fy')} name="fy" defaultValue={fy} options={[{ value: 'all', label: t('c.all_years') }, ...options.fys(fys)]} />
        <SelectField label={t('f.category')} name="category" defaultValue={category} placeholder={t('c.all')} options={options.named(categories, lang)} />
        <SelectField label={t('f.mode')} name="mode" defaultValue={mode} placeholder={t('c.all')} options={options.keyed(MODES, t, 'mode')} />
        <SelectField label={t('f.event')} name="event" defaultValue={event} placeholder={t('c.all')} options={options.events(events, lang)} />
        <TextField label={t('c.from_date')} name="from" type="date" defaultValue={from} />
        <TextField label={t('c.to_date')} name="to" type="date" defaultValue={to} />
        <TextField label={t('c.search')} name="q" type="search" defaultValue={term} placeholder={t('exp.search_ph')} maxLength={80} />
      </FilterForm>

      {rows.length === 0 ? (
        <Empty title={t('exp.none')} hint={t('c.try_filters')}>
          {mayEnter && <Link href="/expenses/new" className="tms-btn">{t('tile.expense')}</Link>}
        </Empty>
      ) : (
        <>
          <DataTable
            rows={rows} hrefFor={(e) => `/expenses/${e.id}`}
            columns={[
              { label: t('f.date'), cell: (e) => fmtDate(e.entry_date) },
              { label: t('exp.payee'), lead: true, cell: (e) => e.payee_as_written || '—' },
              { label: t('f.amount'), right: true, cell: (e) => <Money value={e.amount} /> },
              { label: t('f.category'), cell: (e) => pick(lang, e.cat_mr, e.cat_en) || e.head_as_written || '—' },
              { label: t('exp.particulars'), cell: (e) => (e.particulars ? String(e.particulars).slice(0, 90) : '—') },
              { label: t('exp.voucher_no'), cell: (e) => <span className="mono">{e.voucher_no_as_written || e.code}</span> },
              { label: t('c.record'), cell: (e) => <OriginBadges origin={e.origin} needsReview={e.needs_review} /> },
            ]}
          />
          <Pager page={page} total={sum.n} pageSize={PAGE_SIZE} base="/expenses" params={{ fy, category, mode, event, from, to, q: term }} />
        </>
      )}
    </>
  );
}
