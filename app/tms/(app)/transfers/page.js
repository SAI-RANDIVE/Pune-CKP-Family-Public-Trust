import { DataTable, FilterForm, OriginBadges, PageHead, Pager } from '../../../../components/tms/blocks';
import { Alert, Empty, Money, SelectField, Stat } from '../../../../components/tms/ui';
import { requireRole } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { PAGE_SIZE, Where, oneOf, one, pageOf, q } from '../../../../lib/tms/db';
import { currentFy, fmtDate, formatINR, formatNumber, isFyLabel } from '../../../../lib/tms/format';
import { getFiscalYears, options } from '../../../../lib/tms/lookups';
import { TRANSFER_KINDS } from '../../../../lib/tms/constants';

export const dynamic = 'force-dynamic';

/** Money moved between the trust's own accounts. Shown for reference; not income, not expense. */
export default async function TransfersPage({ searchParams }) {
  await requireRole('viewer');
  const { t } = await getI18n();
  const fyParam = String(searchParams?.fy ?? 'all');
  const fy = isFyLabel(fyParam) ? fyParam : 'all';
  const kind = oneOf(searchParams?.kind, TRANSFER_KINDS);
  const page = pageOf(searchParams);

  const w = new Where(['x.deleted_at is null']);
  if (fy !== 'all') w.add('x.fy = ?', fy);
  if (kind) w.add('x.kind = ?', kind);

  const [fys, sum, rows] = await Promise.all([
    getFiscalYears(currentFy()),
    one(`select count(*)::int as n, coalesce(sum(x.amount), 0) as total from transfers x ${w.sql}`, w.params),
    q(`select x.id, x.code, x.entry_date, x.fy, x.amount, x.kind, x.particulars, x.origin, x.needs_review,
              coalesce(fa.bank, x.from_as_written) as from_name, coalesce(ta.bank, x.to_as_written) as to_name
         from transfers x left join bank_accounts fa on fa.id = x.from_account_id left join bank_accounts ta on ta.id = x.to_account_id
         ${w.sql}
        order by x.entry_date desc nulls last, x.id
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, w.params),
  ]);

  return (
    <>
      <PageHead title={t('trf.title')} intro={t('trf.intro')} crumbs={[{ href: '/expenses', label: t('exp.title') }, { label: t('trf.title') }]} />
      <div style={{ marginBottom: '1rem' }}><Alert tone="info">{t('trf.readonly')}</Alert></div>
      <div className="tms-grid tms-grid--3" style={{ marginBottom: '1.25rem' }}>
        <Stat label={t('trf.sum')} value={formatINR(sum.total)} note={t('dash.entries', { n: formatNumber(sum.n) })} />
      </div>

      <FilterForm action="/transfers">
        <SelectField label={t('f.fy')} name="fy" defaultValue={fy} options={[{ value: 'all', label: t('c.all_years') }, ...options.fys(fys)]} />
        <SelectField label={t('f.kind')} name="kind" defaultValue={kind} placeholder={t('c.all')} options={options.keyed(TRANSFER_KINDS, t, 'tkind')} />
      </FilterForm>

      {rows.length === 0 ? <Empty title={t('trf.none')} hint={t('c.try_filters')} /> : (
        <>
          <DataTable
            rows={rows} hrefFor={(x) => `/source/transfers/${x.id}`} openLabel={t('src.link_short')}
            columns={[
              { label: t('f.date'), cell: (x) => fmtDate(x.entry_date) },
              { label: t('f.kind'), lead: true, cell: (x) => t(`tkind.${x.kind}`) },
              { label: t('f.amount'), right: true, cell: (x) => <Money value={x.amount} /> },
              { label: t('trf.from'), cell: (x) => x.from_name || '—' },
              { label: t('trf.to'), cell: (x) => x.to_name || '—' },
              { label: t('exp.particulars'), cell: (x) => (x.particulars ? String(x.particulars).slice(0, 90) : '—') },
              { label: t('f.id'), cell: (x) => <><span className="mono">{x.code}</span> <OriginBadges origin={x.origin} needsReview={x.needs_review} /></> },
            ]}
          />
          <Pager page={page} total={sum.n} pageSize={PAGE_SIZE} base="/transfers" params={{ fy, kind }} />
        </>
      )}
    </>
  );
}
