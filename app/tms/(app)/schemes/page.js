import Link from 'next/link';
import { DataTable, FilterForm, PageHead } from '../../../../components/tms/blocks';
import { Alert, Bars, Card, Empty, Money, SelectField, Stat } from '../../../../components/tms/ui';
import { PrintButton } from '../../../../components/tms/client';
import { requireRole } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { q } from '../../../../lib/tms/db';
import { currentFy, formatINR, formatNumber, isFyLabel, pick } from '../../../../lib/tms/format';
import { getFiscalYears, options } from '../../../../lib/tms/lookups';

export const dynamic = 'force-dynamic';

/** Welfare schemes: money actually paid, and money only planned, kept apart. */
export default async function SchemesPage({ searchParams }) {
  await requireRole('viewer');
  const { t, lang } = await getI18n();
  const fyParam = String(searchParams?.fy ?? 'all');
  const fy = isFyLabel(fyParam) ? fyParam : 'all';

  const [fys, rows] = await Promise.all([
    getFiscalYears(currentFy()),
    q(`select s.id, s.code, s.name_en, s.name_mr, s.is_active,
              coalesce(sum(v.disbursements), 0)::int as payments, coalesce(sum(v.beneficiaries), 0)::int as beneficiaries,
              coalesce(sum(v.disbursed), 0) as paid, coalesce(sum(v.planned), 0) as planned
         from schemes s left join v_scheme_totals v on v.scheme_id = s.id and ($1::text = 'all' or v.fy = $1)
        group by s.id order by s.code`, [fy]),
  ]);
  const paid = rows.reduce((a, r) => a + Number(r.paid), 0);
  const planned = rows.reduce((a, r) => a + Number(r.planned), 0);

  return (
    <>
      <PageHead title={t('sch.title')} intro={t('sch.intro')} crumbs={[{ label: t('sch.title') }]}>
        <Link href="/events" className="tms-btn tms-btn--secondary">{t('nav.events')}</Link>
        <PrintButton label={t('c.print')} />
      </PageHead>

      <FilterForm action="/schemes">
        <SelectField label={t('f.fy')} name="fy" defaultValue={fy} options={[{ value: 'all', label: t('c.all_years') }, ...options.fys(fys)]} />
      </FilterForm>

      <div className="tms-grid tms-grid--3" style={{ marginBottom: '1.25rem' }}>
        <Stat label={t('sch.paid_total')} value={formatINR(paid)} note={fy === 'all' ? t('c.all_years') : fy} />
        <Stat label={t('sch.planned_total')} value={formatINR(planned)} note={t('sch.planned_note')} />
      </div>
      {planned > 0 && <div style={{ marginBottom: '1rem' }}><Alert tone="info">{t('rep.n.planned')}</Alert></div>}

      {rows.length === 0 ? <Empty title={t('sch.none')} /> : (
        <div className="tms-stack">
          <DataTable
            rows={rows} hrefFor={(s) => `/schemes/${s.id}`}
            columns={[
              { label: t('f.scheme'), lead: true, cell: (s) => <Link href={`/schemes/${s.id}`}>{pick(lang, s.name_mr, s.name_en)}</Link> },
              { label: t('f.id'), cell: (s) => <span className="mono">{s.code}</span> },
              { label: t('rep.c.payments'), right: true, cell: (s) => formatNumber(s.payments) },
              { label: t('rep.c.beneficiaries'), right: true, cell: (s) => formatNumber(s.beneficiaries) },
              { label: t('sch.paid'), right: true, cell: (s) => <Money value={s.paid} /> },
              { label: t('sch.planned'), right: true, cell: (s) => (Number(s.planned) > 0 ? <Money value={s.planned} /> : '—') },
            ]}
            footer={[t('c.total'), '', '', '', formatINR(paid), formatINR(planned)]}
          />
          <Card title={t('sch.chart')}>
            <Bars
              rows={rows.filter((s) => Number(s.paid) > 0 || Number(s.planned) > 0).map((s) => ({
                label: pick(lang, s.name_mr, s.name_en),
                values: [{ series: t('sch.paid'), value: s.paid }, ...(Number(s.planned) > 0 ? [{ series: t('sch.planned'), value: s.planned }] : [])],
              }))}
              empty={t('c.no_data')}
            />
          </Card>
        </div>
      )}
    </>
  );
}
