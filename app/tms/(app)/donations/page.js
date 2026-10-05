import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { DataTable, FilterForm, Flash, OriginBadges, PageHead, Pager } from '../../../../components/tms/blocks';
import { Empty, Money, SelectField, Stat, TextField } from '../../../../components/tms/ui';
import { requireRole, can } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { PAGE_SIZE, Where, isUuid, likeParam, oneOf, one, pageOf, q, textParam } from '../../../../lib/tms/db';
import { currentFy, fmtDate, formatINR, formatNumber, isFyLabel, pick } from '../../../../lib/tms/format';
import { getEvents, getFiscalYears, options } from '../../../../lib/tms/lookups';
import { INCOME_KINDS, MODES } from '../../../../lib/tms/schemas';

export const dynamic = 'force-dynamic';

const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/** Money received: donations, fees, sponsorships and the rest, with filters. */
export default async function DonationsPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  const mayEnter = can(admin, 'enterMoney');

  const fyParam = String(searchParams?.fy ?? '');
  const fy = fyParam === 'all' ? 'all' : (isFyLabel(fyParam) ? fyParam : currentFy());
  const kind = oneOf(searchParams?.kind, INCOME_KINDS);
  const mode = oneOf(searchParams?.mode, MODES);
  const event = isUuid(searchParams?.event) ? searchParams.event : '';
  const from = isIso(searchParams?.from) ? searchParams.from : '';
  const to = isIso(searchParams?.to) ? searchParams.to : '';
  const term = textParam(searchParams?.q, 80);
  const page = pageOf(searchParams);

  const w = new Where(['i.deleted_at is null', "i.kind not in ('loan_received', 'refund_received')"]);
  if (fy !== 'all') w.add('i.fy = ?', fy);
  if (kind) w.add('i.kind = ?', kind);
  if (mode) w.add('i.mode = ?', mode);
  if (event) w.add('i.event_id = ?', event);
  if (from) w.add('i.entry_date >= ?', from);
  if (to) w.add('i.entry_date <= ?', to);
  if (term) {
    const like = w.param(likeParam(term));
    w.conds.push(`(i.payer_as_written ilike ${like} or p.name_en ilike ${like} or p.name_mr ilike ${like} or i.code ilike ${like} or r.number_as_written ilike ${like})`);
  }
  const joins = 'from income_entries i left join people p on p.id = i.person_id left join receipts r on r.id = i.receipt_id';

  const [fys, events, sum, rows] = await Promise.all([
    getFiscalYears(currentFy()),
    getEvents(),
    one(`select count(*)::int as n, coalesce(sum(i.amount), 0) as total, count(*) filter (where i.needs_review)::int as pending ${joins} ${w.sql}`, w.params),
    q(`select i.id, i.code, i.entry_date, i.amount, i.kind, i.mode, i.origin, i.needs_review, i.payer_as_written,
              p.id as person_id, p.name_en, p.name_mr, r.number_as_written as receipt_no, r.is_cancelled
         ${joins} ${w.sql}
        order by i.entry_date desc nulls last, i.created_at desc, i.id
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, w.params),
  ]);

  return (
    <>
      <PageHead title={t('inc.title')} intro={t('inc.intro')} crumbs={[{ label: t('inc.title') }]}>
        {mayEnter && <Link href="/donations/new" className="tms-btn tms-btn--big"><Icon name="plus" />{t('tile.donation')}</Link>}
        <Link href="/receipts" className="tms-btn tms-btn--secondary"><Icon name="receipt" />{t('tile.receipt')}</Link>
        {mayEnter && <Link href="/payments" className="tms-btn tms-btn--secondary">{t('pay.title')}</Link>}
      </PageHead>
      <Flash searchParams={searchParams} />

      <div className="tms-grid tms-grid--3" style={{ marginBottom: '1.25rem' }}>
        <Stat label={t('inc.sum')} value={formatINR(sum.total)} note={t('dash.entries', { n: formatNumber(sum.n) })} />
        {sum.pending > 0 && <Stat label={t('c.needs_review')} value={formatNumber(sum.pending)} note={t('inc.pending_note')} />}
      </div>

      <FilterForm action="/donations">
        <SelectField label={t('f.fy')} name="fy" defaultValue={fy} options={[{ value: 'all', label: t('c.all_years') }, ...options.fys(fys)]} />
        <SelectField label={t('f.kind')} name="kind" defaultValue={kind} placeholder={t('c.all')} options={options.keyed(INCOME_KINDS, t, 'kind')} />
        <SelectField label={t('f.mode')} name="mode" defaultValue={mode} placeholder={t('c.all')} options={options.keyed(MODES, t, 'mode')} />
        <SelectField label={t('f.event')} name="event" defaultValue={event} placeholder={t('c.all')} options={options.events(events, lang)} />
        <TextField label={t('c.from_date')} name="from" type="date" defaultValue={from} />
        <TextField label={t('c.to_date')} name="to" type="date" defaultValue={to} />
        <TextField label={t('inc.search')} name="q" type="search" defaultValue={term} placeholder={t('inc.search_ph')} maxLength={80} />
      </FilterForm>

      {rows.length === 0 ? (
        <Empty title={t('inc.none')} hint={t('c.try_filters')}>
          {mayEnter && <Link href="/donations/new" className="tms-btn">{t('tile.donation')}</Link>}
        </Empty>
      ) : (
        <>
          <DataTable
            rows={rows} hrefFor={(i) => `/donations/${i.id}`}
            columns={[
              { label: t('f.date'), cell: (i) => fmtDate(i.entry_date) },
              { label: t('inc.from_whom'), lead: true, cell: (i) => (i.person_id ? <Link href={`/people/${i.person_id}`}>{pick(lang, i.name_mr, i.name_en)}</Link> : (i.payer_as_written || '—')) },
              { label: t('f.amount'), right: true, cell: (i) => <Money value={i.amount} /> },
              { label: t('f.kind'), cell: (i) => t(`kind.${i.kind}`) },
              { label: t('f.mode'), cell: (i) => (i.mode ? t(`mode.${i.mode}`) : '—') },
              { label: t('f.receipt_no'), cell: (i) => <span className="mono">{i.receipt_no || '—'}</span> },
              { label: t('c.record'), cell: (i) => <OriginBadges origin={i.origin} needsReview={i.needs_review} /> },
            ]}
          />
          <Pager page={page} total={sum.n} pageSize={PAGE_SIZE} base="/donations" params={{ fy, kind, mode, event, from, to, q: term }} />
        </>
      )}
    </>
  );
}
