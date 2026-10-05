import Link from 'next/link';
import { DataTable, FilterForm, PageHead } from '../../../../components/tms/blocks';
import { Alert, Empty, Money, SelectField } from '../../../../components/tms/ui';
import { requireRole } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { q } from '../../../../lib/tms/db';
import { fmtDate, isFyLabel, pick } from '../../../../lib/tms/format';
import { options } from '../../../../lib/tms/lookups';

export const dynamic = 'force-dynamic';

/** Events and programmes, each with two separate sets of figures side by side. */
export default async function EventsPage({ searchParams }) {
  await requireRole('viewer');
  const { t, lang } = await getI18n();
  const fyParam = String(searchParams?.fy ?? 'all');
  const fy = isFyLabel(fyParam) ? fyParam : 'all';

  const [fys, rows] = await Promise.all([
    q('select distinct fy from events where deleted_at is null and fy is not null order by fy desc'),
    q(`select event_id as id, code, name_en, name_mr, event_date, fy, event_income, event_expense, books_income, books_expense
         from v_event_accounts where ($1::text = 'all' or fy = $1)
        order by event_date desc nulls last, code desc`, [fy]),
  ]);
  const cell = (v) => (Number(v) > 0 ? <Money value={v} /> : '—');

  return (
    <>
      <PageHead title={t('evt.title')} intro={t('evt.intro')} crumbs={[{ href: '/schemes', label: t('sch.title') }, { label: t('evt.title') }]} />
      <div style={{ marginBottom: '1rem' }}><Alert tone="info" title={t('evt.two_books')}>{t('evt.two_books_body')}</Alert></div>

      <FilterForm action="/events">
        <SelectField label={t('f.fy')} name="fy" defaultValue={fy} options={[{ value: 'all', label: t('c.all_years') }, ...options.fys(fys.map((r) => r.fy))]} />
      </FilterForm>

      {rows.length === 0 ? <Empty title={t('evt.none')} hint={t('c.try_filters')} /> : (
        <DataTable
          rows={rows} hrefFor={(e) => `/events/${e.id}`}
          columns={[
            { label: t('f.event'), lead: true, cell: (e) => <Link href={`/events/${e.id}`}>{pick(lang, e.name_mr, e.name_en)}</Link> },
            { label: t('f.date'), cell: (e) => (e.event_date ? fmtDate(e.event_date) : (e.fy || '—')) },
            { label: t('evt.own_income'), right: true, cell: (e) => cell(e.event_income) },
            { label: t('evt.own_expense'), right: true, cell: (e) => cell(e.event_expense) },
            { label: t('evt.books_income'), right: true, cell: (e) => cell(e.books_income) },
            { label: t('evt.books_expense'), right: true, cell: (e) => cell(e.books_expense) },
          ]}
        />
      )}
    </>
  );
}
