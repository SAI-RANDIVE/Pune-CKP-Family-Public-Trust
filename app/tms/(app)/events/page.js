import Link from 'next/link';
import { DataTable, FilterForm, PageHead } from '../../../../components/tms/blocks';
import { Alert, Empty, Money, SelectField } from '../../../../components/tms/ui';
import Icon from '../../../../components/tms/icons';
import { requireRole, can } from '../../../../lib/tms/auth';
import { canChange } from '../../../../lib/tms/access';
import { Badge } from '../../../../components/tms/ui';
import { Flash } from '../../../../components/tms/blocks';
import { formatNumber } from '../../../../lib/tms/format';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { q } from '../../../../lib/tms/db';
import { fmtDate, isFyLabel, pick } from '../../../../lib/tms/format';
import { options } from '../../../../lib/tms/lookups';

export const dynamic = 'force-dynamic';

/** Events and programmes, each with two separate sets of figures side by side. */
export default async function EventsPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const mayEdit = can(admin, 'enterMoney') && canChange(admin, 'events');
  const { t, lang } = await getI18n();
  const fyParam = String(searchParams?.fy ?? 'all');
  const fy = isFyLabel(fyParam) ? fyParam : 'all';

  const [fys, rows] = await Promise.all([
    q('select distinct fy from events where deleted_at is null and fy is not null order by fy desc'),
    q(`select a.event_id as id, a.code, a.name_en, a.name_mr, a.event_date, a.fy, a.event_income, a.event_expense, a.books_income, a.books_expense,
              e.is_published, e.registration_open,
              (select count(*)::int from event_registrations r where r.event_id = a.event_id and r.status <> 'cancelled') as regs
         from v_event_accounts a join events e on e.id = a.event_id
        where ($1::text = 'all' or a.fy = $1)
        order by a.event_date desc nulls last, a.code desc`, [fy]),
  ]);
  const cell = (v) => (Number(v) > 0 ? <Money value={v} /> : '—');

  return (
    <>
      <PageHead title={t('evt.title')} intro={t('evt.intro')} crumbs={[{ label: t('evt.title') }]}>
        {mayEdit && <Link href="/events/new" className="tms-btn"><Icon name="plus" />{t('x.ev.add')}</Link>}
        <Link href="/planner" className="tms-btn tms-btn--secondary"><Icon name="scheme" />{t('x.pl.title')}</Link>
      </PageHead>
      <Flash searchParams={searchParams} />
      <div style={{ marginBottom: '1rem' }}><Alert tone="info" title={t('evt.two_books')}>{t('evt.two_books_body')}</Alert></div>

      <FilterForm action="/events">
        <SelectField label={t('f.fy')} name="fy" defaultValue={fy} options={[{ value: 'all', label: t('c.all_years') }, ...options.fys(fys.map((r) => r.fy))]} />
      </FilterForm>

      {rows.length === 0 ? <Empty title={t('evt.none')} hint={t('c.try_filters')} /> : (
        <DataTable
          rows={rows} hrefFor={(e) => `/events/${e.id}/manage`} openLabel={t('x.ev.manage')}
          columns={[
            { label: t('f.event'), lead: true, cell: (e) => <Link href={`/events/${e.id}`}>{pick(lang, e.name_mr, e.name_en)}</Link> },
            { label: t('f.date'), cell: (e) => (e.event_date ? fmtDate(e.event_date) : (e.fy || '—')) },
            { label: t('x.ev.on_site_col'), cell: (e) => (e.is_published ? <><Badge tone="ok">{t('x.ev.on_site')}</Badge>{e.registration_open && <> <Badge tone="info">{t('x.ev.reg_is_open')}</Badge></>}</> : '—') },
            { label: t('x.ev.registrations'), right: true, cell: (e) => (e.regs ? formatNumber(e.regs) : '—') },
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
