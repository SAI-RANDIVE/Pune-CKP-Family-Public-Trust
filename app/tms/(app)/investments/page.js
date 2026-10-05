import { DataTable, PageHead } from '../../../../components/tms/blocks';
import { Alert, Empty, Money } from '../../../../components/tms/ui';
import { requireRole } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { q } from '../../../../lib/tms/db';
import { fmtDate, formatINR, formatNumber } from '../../../../lib/tms/format';

export const dynamic = 'force-dynamic';

/** Mutual funds and other investments: what was put in, by year. Shown for reference. */
export default async function InvestmentsPage() {
  await requireRole('viewer');
  const { t } = await getI18n();

  const [rows, byFy] = await Promise.all([
    q(`select i.id, i.code, i.kind, i.name, i.folio, i.notes,
              coalesce(sum(x.amount), 0) as invested, count(x.id)::int as entries, min(x.txn_date) as first_on, max(x.txn_date) as last_on
         from investments i left join investment_transactions x on x.investment_id = i.id and x.deleted_at is null
        where i.deleted_at is null group by i.id order by i.code`),
    q(`select x.fy, sum(x.amount) as total, count(*)::int as entries from investment_transactions x
        where x.deleted_at is null group by x.fy order by x.fy`),
  ]);
  const total = rows.reduce((a, r) => a + Number(r.invested), 0);

  return (
    <>
      <PageHead title={t('inv.title')} intro={t('inv.intro')} crumbs={[{ href: '/deposits', label: t('fd.title') }, { label: t('inv.title') }]} />
      <div style={{ marginBottom: '1rem' }}><Alert tone="info">{t('inv.readonly')}</Alert></div>

      {rows.length === 0 ? <Empty title={t('inv.none')} /> : (
        <div className="tms-stack">
          <DataTable
            rows={rows} hrefFor={(i) => `/source/investments/${i.id}`} openLabel={t('src.link_short')}
            columns={[
              { label: t('f.name'), lead: true, cell: (i) => i.name },
              { label: t('f.id'), cell: (i) => <span className="mono">{i.code}</span> },
              { label: t('inv.folio'), cell: (i) => <span className="mono">{i.folio || '—'}</span> },
              { label: t('inv.invested'), right: true, cell: (i) => <Money value={i.invested} /> },
              { label: t('rep.c.entries'), right: true, cell: (i) => formatNumber(i.entries) },
              { label: t('inv.period'), cell: (i) => (i.first_on ? `${fmtDate(i.first_on)} – ${fmtDate(i.last_on)}` : '—') },
            ]}
            footer={[t('c.total'), '', '', formatINR(total), '', '']}
          />
          {byFy.length > 0 && (
            <section aria-labelledby="inv-fy">
              <h2 id="inv-fy" style={{ marginBottom: '0.5rem' }}>{t('inv.by_fy')}</h2>
              <DataTable
                rows={byFy}
                columns={[
                  { label: t('f.fy'), lead: true, cell: (r) => r.fy || '—' },
                  { label: t('rep.c.entries'), right: true, cell: (r) => formatNumber(r.entries) },
                  { label: t('inv.invested'), right: true, cell: (r) => <Money value={r.total} /> },
                ]}
              />
            </section>
          )}
        </div>
      )}
    </>
  );
}
