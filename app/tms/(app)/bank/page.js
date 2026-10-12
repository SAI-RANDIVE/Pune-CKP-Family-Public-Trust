import Link from 'next/link';
import { DataTable, FilterForm, PageHead, Pager } from '../../../../components/tms/blocks';
import { Alert, Badge, Card, Empty, Money, SelectField } from '../../../../components/tms/ui';
import { PrintButton } from '../../../../components/tms/client';
import { requireRole } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { PAGE_SIZE, one, oneOf, pageOf, q } from '../../../../lib/tms/db';
import { fmtDate, fmtDateTime, formatNumber, isFyLabel } from '../../../../lib/tms/format';
import { options } from '../../../../lib/tms/lookups';

export const dynamic = 'force-dynamic';

const STATUSES = ['matched', 'matched_group', 'ambiguous', 'unmatched', 'no_statement', 'cash'];
const TONE = { matched: 'ok', matched_group: 'ok', ambiguous: 'warn', unmatched: 'error', no_statement: 'neutral', cash: 'neutral' };

/**
 * Every expense checked against the bank statements: which vouchers agree
 * with a statement debit, which do not, and which were paid in cash and so
 * cannot appear on a statement. The check is run from the trust's computer
 * (data-migration/etl/60_verify_expenses.py); this screen shows its result.
 */
export default async function BankCheckPage({ searchParams }) {
  await requireRole('viewer');
  const { t } = await getI18n();
  const fyParam = String(searchParams?.fy ?? 'all');
  const fy = isFyLabel(fyParam) ? fyParam : 'all';
  const status = oneOf(searchParams?.status, STATUSES, 'unmatched');
  const page = pageOf(searchParams);

  const [summary, fys, checked, total, rows] = await Promise.all([
    q(`select e.fy, v.status, count(*)::int as n,
              sum(case when v.status = 'cash' then coalesce(e.cash_amount, e.amount) else coalesce(e.bank_amount, e.amount) end) as amount
         from expense_verifications v join expenses e on e.id = v.expense_id
        where e.deleted_at is null group by e.fy, v.status order by e.fy`),
    q('select distinct fy from expenses where deleted_at is null and fy is not null order by fy desc'),
    one('select max(checked_at) as at, count(*)::int as n from expense_verifications'),
    one(`select count(*)::int as n from expense_verifications v join expenses e on e.id = v.expense_id
          where e.deleted_at is null and v.status = $1 and ($2::text = 'all' or e.fy = $2)`, [status, fy]),
    q(`select e.id, e.code, e.voucher_no_as_written, e.entry_date, e.fy, e.payee_as_written, e.particulars, e.bank_amount, e.cash_amount, e.amount,
              v.status, v.detail, v.days_apart, b.bank, bt.txn_date, bt.narration
         from expense_verifications v
         join expenses e on e.id = v.expense_id
         left join bank_accounts b on b.id = e.bank_account_id
         left join bank_transactions bt on bt.id = v.bank_transaction_id
        where e.deleted_at is null and v.status = $1 and ($2::text = 'all' or e.fy = $2)
        order by e.entry_date desc nulls last, e.code
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, [status, fy]),
  ]);

  const years = [...new Set(summary.map((r) => r.fy))];
  const cell = (year, s) => summary.find((r) => r.fy === year && r.status === s);
  const bankPaid = summary.filter((r) => ['matched', 'matched_group', 'ambiguous', 'unmatched'].includes(r.status));
  const agreed = bankPaid.filter((r) => r.status.startsWith('matched')).reduce((n, r) => n + r.n, 0);
  const all = bankPaid.reduce((n, r) => n + r.n, 0);

  return (
    <>
      <PageHead title={t('x.bk.title')} intro={t('x.bk.intro')} crumbs={[{ href: '/reports', label: t('nav.reports') }, { label: t('x.bk.title') }]}>
        <PrintButton label={t('c.print')} />
      </PageHead>

      <div className="tms-stack">
        {!checked.n ? <Alert tone="warn" title={t('x.bk.never')}>{t('x.bk.never_body')}</Alert> : (
          <Alert tone="info" title={t('x.bk.headline', { ok: formatNumber(agreed), all: formatNumber(all), pct: all ? ((100 * agreed) / all).toFixed(1) : '0' })}>
            {t('x.bk.checked_on', { when: fmtDateTime(checked.at) })} {t('x.bk.rule')}
          </Alert>
        )}

        <Card title={t('x.bk.by_year')}>
          <div className="tms-tablewrap">
            <table className="tms-table">
              <thead>
                <tr>
                  <th scope="col">{t('f.fy')}</th>
                  {STATUSES.map((s) => <th key={s} scope="col" className="r">{t(`x.bk.st.${s}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {years.map((year) => (
                  <tr key={year}>
                    <td data-label={t('f.fy')} className="lead">{year}</td>
                    {STATUSES.map((s) => {
                      const c = cell(year, s);
                      return (
                        <td key={s} data-label={t(`x.bk.st.${s}`)} className="r num">
                          {c ? <Link href={`/bank?fy=${year}&status=${s}`}>{formatNumber(c.n)}<br /><small><Money value={c.amount} /></small></Link> : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tms-hint" style={{ marginTop: '0.75rem' }}>{t('x.bk.legend')}</p>
        </Card>

        <FilterForm action="/bank">
          <SelectField label={t('f.fy')} name="fy" defaultValue={fy} options={[{ value: 'all', label: t('c.all_years') }, ...options.fys(fys.map((r) => r.fy))]} />
          <SelectField label={t('x.bk.result')} name="status" defaultValue={status} options={STATUSES.map((s) => ({ value: s, label: t(`x.bk.st.${s}`) }))} />
        </FilterForm>

        <h2>{t(`x.bk.st.${status}`)} ({formatNumber(total.n)})</h2>
        {rows.length === 0 ? <Empty title={t('x.bk.none')} hint={t('c.try_filters')} /> : (
          <DataTable
            rows={rows} hrefFor={(r) => `/expenses/${r.id}`}
            columns={[
              { label: t('f.date'), cell: (r) => (r.entry_date ? fmtDate(r.entry_date) : r.fy) },
              { label: t('x.bk.voucher'), cell: (r) => <span className="mono">{r.voucher_no_as_written || r.code}</span> },
              { label: t('exp.payee'), lead: true, cell: (r) => r.payee_as_written || String(r.particulars || '').slice(0, 70) || '—' },
              { label: t('f.amount'), right: true, cell: (r) => <Money value={r.status === 'cash' ? (r.cash_amount ?? r.amount) : (r.bank_amount ?? r.amount)} /> },
              { label: t('x.bk.account'), cell: (r) => r.bank || '—' },
              { label: t('x.bk.result'), cell: (r) => (
                <>
                  <Badge tone={TONE[r.status]}>{t(`x.bk.st.${r.status}`)}</Badge>
                  <br /><small className="muted">{r.detail}{r.narration ? ` · ${String(r.narration).slice(0, 60)}` : ''}</small>
                </>
              ) },
            ]}
          />
        )}
        <Pager page={page} total={total.n} pageSize={PAGE_SIZE} base="/bank" params={{ fy: fy === 'all' ? '' : fy, status }} />
      </div>
    </>
  );
}
