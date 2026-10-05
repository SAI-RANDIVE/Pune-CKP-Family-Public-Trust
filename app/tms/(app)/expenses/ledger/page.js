import Link from 'next/link';
import { DataTable, FilterForm, PageHead } from '../../../../../components/tms/blocks';
import { Bars, Card, Empty, Money, SelectField } from '../../../../../components/tms/ui';
import { PrintButton } from '../../../../../components/tms/client';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { q } from '../../../../../lib/tms/db';
import { currentFy, formatINR, formatNumber, isFyLabel, pick } from '../../../../../lib/tms/format';
import { getFiscalYears, options } from '../../../../../lib/tms/lookups';

export const dynamic = 'force-dynamic';

/** Expense ledger: the year by head of account, and month by month. */
export default async function LedgerPage({ searchParams }) {
  await requireRole('viewer');
  const { t, lang } = await getI18n();
  const fy = isFyLabel(searchParams?.fy) ? searchParams.fy : currentFy();

  const [fys, rows] = await Promise.all([
    getFiscalYears(currentFy()),
    q(`select e.cal_year, e.cal_month, e.category_id, coalesce(c.name_en, e.head_as_written, 'Uncategorised') as cat_en, c.name_mr as cat_mr,
              count(*)::int as entries, sum(e.amount) as total
         from expenses e left join categories c on c.id = e.category_id
        where e.deleted_at is null and e.fy = $1
        group by e.cal_year, e.cal_month, e.category_id, coalesce(c.name_en, e.head_as_written, 'Uncategorised'), c.name_mr
        order by e.cal_year nulls last, e.cal_month nulls last, sum(e.amount) desc`, [fy]),
  ]);

  const byCat = new Map();
  const byMonth = new Map();
  for (const r of rows) {
    const name = pick(lang, r.cat_mr, r.cat_en);
    const cat = byCat.get(name) || { name, id: r.category_id, entries: 0, total: 0 };
    cat.entries += r.entries; cat.total += Number(r.total);
    byCat.set(name, cat);
    const key = r.cal_month ? `${r.cal_year}-${String(r.cal_month).padStart(2, '0')}` : 'none';
    const month = byMonth.get(key) || { key, label: r.cal_month ? `${t(`month.${r.cal_month}`)} ${r.cal_year}` : t('led.no_date'), entries: 0, total: 0, lines: [] };
    month.entries += r.entries; month.total += Number(r.total);
    month.lines.push({ name, entries: r.entries, total: r.total });
    byMonth.set(key, month);
  }
  const cats = [...byCat.values()].sort((a, b) => b.total - a.total);
  const months = [...byMonth.values()];
  const grand = cats.reduce((a, c) => a + c.total, 0);
  const count = cats.reduce((a, c) => a + c.entries, 0);

  return (
    <>
      <PageHead title={`${t('led.title')} ${fy}`} intro={t('led.intro')} crumbs={[{ href: '/expenses', label: t('exp.title') }, { label: t('led.title') }]}>
        <PrintButton label={t('c.print')} />
      </PageHead>
      <FilterForm action="/expenses/ledger">
        <SelectField label={t('f.fy')} name="fy" defaultValue={fy} options={options.fys(fys)} />
      </FilterForm>

      {rows.length === 0 ? <Empty title={t('exp.none')} hint={t('c.try_filters')} /> : (
        <div className="tms-stack">
          <section aria-labelledby="l-year">
            <h2 id="l-year" style={{ marginBottom: '0.5rem' }}>{t('led.by_category')}</h2>
            <DataTable
              rows={cats}
              columns={[
                { label: t('f.category'), lead: true, cell: (c) => (c.id ? <Link href={`/expenses?fy=${fy}&category=${c.id}`}>{c.name}</Link> : c.name) },
                { label: t('rep.c.entries'), right: true, cell: (c) => formatNumber(c.entries) },
                { label: t('f.amount'), right: true, cell: (c) => <Money value={c.total} /> },
                { label: t('led.share'), right: true, cell: (c) => `${grand ? ((c.total / grand) * 100).toFixed(1) : '0'}%` },
              ]}
              footer={[t('c.total'), formatNumber(count), formatINR(grand), '100%']}
            />
          </section>

          <Card title={t('led.chart')}>
            <Bars rows={cats.slice(0, 12).map((c) => ({ label: c.name, values: [{ series: t('f.amount'), value: c.total }] }))} />
          </Card>

          <section aria-labelledby="l-month">
            <h2 id="l-month" style={{ marginBottom: '0.5rem' }}>{t('led.by_month')}</h2>
            <div className="tms-stack">
              {months.map((m) => (
                <DataTable
                  key={m.key} caption={`${m.label}: ${formatINR(m.total)} (${t('dash.vouchers', { n: formatNumber(m.entries) })})`}
                  rows={m.lines}
                  columns={[
                    { label: t('f.category'), lead: true, cell: (l) => l.name },
                    { label: t('rep.c.entries'), right: true, cell: (l) => formatNumber(l.entries) },
                    { label: t('f.amount'), right: true, cell: (l) => <Money value={l.total} /> },
                  ]}
                  footer={[t('c.total'), formatNumber(m.entries), formatINR(m.total)]}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
