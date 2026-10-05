import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { DataTable, PageHead, Pager } from '../../../../components/tms/blocks';
import { Badge, Empty, Money } from '../../../../components/tms/ui';
import { requireRole, can } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { PAGE_SIZE, Where, likeParam, one, pageOf, q, textParam } from '../../../../lib/tms/db';
import { fmtDate, pick } from '../../../../lib/tms/format';

export const dynamic = 'force-dynamic';

/** Find a receipt by its number (new or old book), the payer's name, or the amount. */
export default async function ReceiptsPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  const term = textParam(searchParams?.q, 80);
  const page = pageOf(searchParams);

  const w = new Where(['r.deleted_at is null']);
  if (term) {
    const like = w.param(likeParam(term));
    const amount = /^\d+(\.\d{1,2})?$/.test(term) ? w.param(term) : null;
    w.conds.push(`(r.number_as_written ilike ${like} or r.code ilike ${like} or i.payer_as_written ilike ${like}
      or p.name_en ilike ${like} or p.name_mr ilike ${like}${amount ? ` or i.amount = ${amount}::numeric` : ''})`);
  }
  const joins = `from receipts r
    left join income_entries i on i.receipt_id = r.id and i.deleted_at is null
    left join people p on p.id = i.person_id`;

  const [{ n: total }, rows] = await Promise.all([
    one(`select count(*)::int as n ${joins} ${w.sql}`, w.params),
    q(`select r.id, r.code, r.number_as_written, r.receipt_date, r.fy, r.is_cancelled, r.origin,
              i.id as income_id, i.amount, i.kind, i.payer_as_written, p.id as person_id, p.name_en, p.name_mr
         ${joins} ${w.sql}
        order by r.receipt_date desc nulls last, r.created_at desc, r.id
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, w.params),
  ]);

  return (
    <>
      <PageHead title={t('tile.receipt')} intro={t('rcp.find_intro')} crumbs={[{ href: '/donations', label: t('inc.title') }, { label: t('tile.receipt') }]}>
        {can(admin, 'enterMoney') && <Link href="/emails" className="tms-btn tms-btn--secondary"><Icon name="mail" />{t('mail.title')}</Link>}
      </PageHead>

      <form method="get" action="/receipts" role="search" className="tms-search" style={{ marginBottom: '1.5rem' }}>
        <label className="sr-only" htmlFor="q">{t('rcp.find_label')}</label>
        <input className="tms-input" id="q" name="q" type="search" defaultValue={term} maxLength={80} placeholder={t('rcp.find_ph')} />
        <button type="submit" className="tms-btn tms-btn--big"><Icon name="search" />{t('search.go')}</button>
      </form>

      {rows.length === 0 ? <Empty title={t('rcp.none_found')} hint={t('rcp.none_hint')} /> : (
        <>
          <DataTable
            rows={rows} hrefFor={(r) => (r.income_id ? `/donations/${r.income_id}` : `/source/receipts/${r.id}`)}
            columns={[
              { label: t('f.receipt_no'), lead: true, cell: (r) => <span className="mono">{r.number_as_written || r.code}</span> },
              { label: t('f.date'), cell: (r) => fmtDate(r.receipt_date) },
              { label: t('inc.from_whom'), cell: (r) => (r.person_id ? pick(lang, r.name_mr, r.name_en) : (r.payer_as_written || '—')) },
              { label: t('f.amount'), right: true, cell: (r) => (r.amount != null ? <Money value={r.amount} /> : '—') },
              { label: t('f.kind'), cell: (r) => (r.kind ? t(`kind.${r.kind}`) : '—') },
              {
                label: t('f.status'),
                cell: (r) => (r.is_cancelled ? <Badge tone="error">{t('status.cancelled')}</Badge>
                  : r.origin === 'manual' ? <Badge tone="ok">{t('rcp.has_pdf')}</Badge> : <Badge tone="neutral">{t('rcp.book')}</Badge>),
              },
            ]}
          />
          <Pager page={page} total={total} pageSize={PAGE_SIZE} base="/receipts" params={{ q: term }} />
        </>
      )}
    </>
  );
}
