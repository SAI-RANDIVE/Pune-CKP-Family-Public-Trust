import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataTable, PageHead } from '../../../../../components/tms/blocks';
import { Alert, Card, KeyValues, Money } from '../../../../../components/tms/ui';
import { PrintButton } from '../../../../../components/tms/client';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../lib/tms/db';
import { fmtDate, formatINR, formatNumber, pick } from '../../../../../lib/tms/format';

export const dynamic = 'force-dynamic';

/**
 * One event. Left: the organisers' own accounts. Right: what the trust's main
 * books show for the same event. They describe the same money twice, so they
 * are shown beside each other and never added together.
 */
export default async function EventPage({ params }) {
  await requireRole('viewer');
  const { t, lang } = await getI18n();
  if (!isUuid(params.id)) notFound();
  const e = await one('select * from v_event_accounts where event_id = $1', [params.id]);
  if (!e) notFound();

  const [heads, lines, income, expenses] = await Promise.all([
    q(`select side, coalesce(head_as_written, '—') as head, count(*)::int as n, sum(amount) as total
         from event_account_lines where event_id = $1 and deleted_at is null and side in ('income', 'expense')
        group by side, coalesce(head_as_written, '—') order by side, sum(amount) desc`, [params.id]),
    q(`select id, side, line_date, head_as_written, party_as_written, amount, mode_as_written, notes
         from event_account_lines where event_id = $1 and deleted_at is null
        order by side, line_date nulls last, id limit 400`, [params.id]),
    q(`select i.id, i.code, i.entry_date, i.amount, i.kind, i.payer_as_written from income_entries i
        where i.event_id = $1 and i.deleted_at is null order by i.entry_date nulls last limit 400`, [params.id]),
    q(`select x.id, x.code, x.entry_date, x.amount, x.payee_as_written, x.particulars from expenses x
        where x.event_id = $1 and x.deleted_at is null order by x.entry_date nulls last limit 400`, [params.id]),
  ]);
  const name = pick(lang, e.name_mr, e.name_en);
  const memo = lines.filter((l) => l.side === 'memo').length;

  const headTable = (side) => {
    const rows = heads.filter((h) => h.side === side);
    if (!rows.length) return <p className="muted">{t('c.none')}</p>;
    return (
      <DataTable
        rows={rows}
        columns={[
          { label: t('evt.head'), lead: true, cell: (h) => h.head },
          { label: t('rep.c.entries'), right: true, cell: (h) => formatNumber(h.n) },
          { label: t('f.amount'), right: true, cell: (h) => <Money value={h.total} /> },
        ]}
      />
    );
  };

  return (
    <>
      <PageHead title={name} intro={[e.event_date ? fmtDate(e.event_date) : null, e.fy, e.code].filter(Boolean).join(' · ')} crumbs={[{ href: '/events', label: t('evt.title') }, { label: e.code }]}>
        <PrintButton label={t('c.print')} />
      </PageHead>
      <div style={{ marginBottom: '1.25rem' }}><Alert tone="info" title={t('evt.two_books')}>{t('evt.two_books_body')}</Alert></div>

      <div className="tms-grid tms-grid--2">
        <Card title={t('evt.own_title')}>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>{t('evt.own_note')}</p>
          <KeyValues items={[
            [t('rep.c.income'), <strong className="num">{formatINR(e.event_income)}</strong>],
            [t('rep.c.expense'), <strong className="num">{formatINR(e.event_expense)}</strong>],
            [t('evt.net'), <strong className="num">{formatINR(e.event_net)}</strong>],
            [t('evt.memo_lines'), memo ? formatNumber(memo) : ''],
          ]} />
          <h3 style={{ margin: '1rem 0 0.5rem' }}>{t('evt.income_heads')}</h3>
          {headTable('income')}
          <h3 style={{ margin: '1rem 0 0.5rem' }}>{t('evt.expense_heads')}</h3>
          {headTable('expense')}
        </Card>

        <Card title={t('evt.books_title')}>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>{t('evt.books_note')}</p>
          <KeyValues items={[
            [t('rep.c.income'), <strong className="num">{formatINR(e.books_income)}</strong>],
            [t('rep.c.expense'), <strong className="num">{formatINR(e.books_expense)}</strong>],
            [t('evt.net'), <strong className="num">{formatINR(Number(e.books_income) - Number(e.books_expense))}</strong>],
          ]} />
          <h3 style={{ margin: '1rem 0 0.5rem' }}>{t('evt.books_income_list')} ({income.length})</h3>
          {income.length === 0 ? <p className="muted">{t('c.none')}</p> : (
            <DataTable
              rows={income} hrefFor={(i) => `/donations/${i.id}`}
              columns={[
                { label: t('f.date'), cell: (i) => fmtDate(i.entry_date) },
                { label: t('inc.from_whom'), lead: true, cell: (i) => i.payer_as_written || t(`kind.${i.kind}`) },
                { label: t('f.amount'), right: true, cell: (i) => <Money value={i.amount} /> },
              ]}
            />
          )}
          <h3 style={{ margin: '1rem 0 0.5rem' }}>{t('evt.books_expense_list')} ({expenses.length})</h3>
          {expenses.length === 0 ? <p className="muted">{t('c.none')}</p> : (
            <DataTable
              rows={expenses} hrefFor={(x) => `/expenses/${x.id}`}
              columns={[
                { label: t('f.date'), cell: (x) => fmtDate(x.entry_date) },
                { label: t('exp.payee'), lead: true, cell: (x) => x.payee_as_written || (x.particulars ? String(x.particulars).slice(0, 60) : '—') },
                { label: t('f.amount'), right: true, cell: (x) => <Money value={x.amount} /> },
              ]}
            />
          )}
        </Card>
      </div>

      {lines.length > 0 && (
        <section aria-labelledby="ev-lines" style={{ marginTop: '1.5rem' }}>
          <h2 id="ev-lines" style={{ marginBottom: '0.5rem' }}>{t('evt.own_lines')} ({lines.length})</h2>
          <DataTable
            rows={lines} hrefFor={(l) => `/source/event_account_lines/${l.id}`} openLabel={t('src.link_short')}
            columns={[
              { label: t('evt.side'), cell: (l) => t(`evt.side_${l.side}`) },
              { label: t('f.date'), cell: (l) => fmtDate(l.line_date) },
              { label: t('evt.head'), lead: true, cell: (l) => l.head_as_written || '—' },
              { label: t('evt.party'), cell: (l) => l.party_as_written || '—' },
              { label: t('f.amount'), right: true, cell: (l) => <Money value={l.amount} /> },
              { label: t('f.notes'), cell: (l) => [l.mode_as_written, l.notes].filter(Boolean).join(' · ') || '—' },
            ]}
          />
          <p className="tms-hint">
            <Link href="/events">{t('evt.back_list')}</Link>
          </p>
        </section>
      )}
    </>
  );
}
