import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { DataTable, FilterForm, Flash, OriginBadges, PageHead } from '../../../../components/tms/blocks';
import { Alert, Badge, Empty, Money, SelectField, Stat } from '../../../../components/tms/ui';
import { PrintButton } from '../../../../components/tms/client';
import { requireRole, can } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { Where, oneOf, one, q } from '../../../../lib/tms/db';
import { fmtDate, formatINR, formatNumber } from '../../../../lib/tms/format';
import { options } from '../../../../lib/tms/lookups';
import { FD_STATUSES, TONE_BY_STATUS } from '../../../../lib/tms/constants';

export const dynamic = 'force-dynamic';

/** Fixed-deposit register, and the maturity calendar (deposits still running, soonest first). */
export default async function DepositsPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t } = await getI18n();
  const calendar = searchParams?.view === 'calendar';
  const status = oneOf(searchParams?.status, FD_STATUSES);

  const w = new Where(['f.deleted_at is null']);
  if (calendar) w.conds.push("f.status in ('active', 'unknown')");
  else if (status) w.add('f.status = ?', status);

  const [sum, rows] = await Promise.all([
    one(`select count(*) filter (where status in ('active', 'unknown'))::int as running,
                coalesce(sum(principal) filter (where status in ('active', 'unknown')), 0) as principal,
                count(*) filter (where status in ('active', 'unknown') and maturity_date < current_date)::int as past,
                count(*) filter (where status in ('active', 'unknown') and maturity_date between current_date and current_date + 90)::int as soon
           from fixed_deposits where deleted_at is null`),
    q(`select f.id, f.code, f.bank, f.fd_number, f.principal, f.rate_pct, f.start_date, f.maturity_date, f.maturity_amount, f.status,
              f.origin, f.needs_review, (f.maturity_date - current_date) as days
         from fixed_deposits f ${w.sql}
        order by ${calendar ? 'f.maturity_date nulls last' : "(f.status in ('active', 'unknown')) desc, f.maturity_date desc nulls last"}, f.code
        limit 300`, w.params),
  ]);

  const dueBadge = (f) => {
    if (!['active', 'unknown'].includes(f.status) || f.days == null) return null;
    if (f.days < 0) return <Badge tone="error">{t('fd.past_days', { n: -f.days })}</Badge>;
    if (f.days <= 90) return <Badge tone="warn">{t('fd.in_days', { n: f.days })}</Badge>;
    return null;
  };

  return (
    <>
      <PageHead title={calendar ? t('fd.calendar') : t('fd.title')} intro={calendar ? t('fd.calendar_intro') : t('fd.intro')} crumbs={[{ label: t('fd.title') }]}>
        {can(admin, 'enterMoney') && <Link href="/deposits/new" className="tms-btn"><Icon name="plus" />{t('fd.add')}</Link>}
        {calendar
          ? <Link href="/deposits" className="tms-btn tms-btn--secondary">{t('fd.register')}</Link>
          : <Link href="/deposits?view=calendar" className="tms-btn tms-btn--secondary"><Icon name="event" />{t('fd.calendar')}</Link>}
        <Link href="/investments" className="tms-btn tms-btn--secondary">{t('inv.title')}</Link>
        <PrintButton label={t('c.print')} />
      </PageHead>
      <Flash searchParams={searchParams} />

      <div className="tms-grid tms-grid--4" style={{ marginBottom: '1.25rem' }}>
        <Stat label={t('fd.running')} value={formatNumber(sum.running)} note={t('fd.running_note')} />
        <Stat label={t('fd.principal_total')} value={formatINR(sum.principal)} />
        <Stat label={t('fd.soon')} value={formatNumber(sum.soon)} href="/deposits?view=calendar" />
        <Stat label={t('fd.past')} value={formatNumber(sum.past)} href="/deposits?view=calendar" />
      </div>
      {sum.past > 0 && <div style={{ marginBottom: '1rem' }}><Alert tone="error" title={t('dash.a.fd_past', { n: sum.past })}>{t('dash.a.fd_past_body')}</Alert></div>}

      {!calendar && (
        <FilterForm action="/deposits">
          <SelectField label={t('f.status')} name="status" defaultValue={status} placeholder={t('c.all')} options={options.keyed(FD_STATUSES, t, 'fdstatus')} />
        </FilterForm>
      )}

      {rows.length === 0 ? <Empty title={t('fd.none')} hint={t('c.try_filters')} /> : (
        <DataTable
          rows={rows} hrefFor={(f) => `/deposits/${f.id}`}
          columns={[
            { label: t('fd.maturity'), cell: (f) => <>{fmtDate(f.maturity_date)} {dueBadge(f)}</> },
            { label: t('f.bank'), lead: true, cell: (f) => f.bank },
            { label: t('fd.number'), cell: (f) => <span className="mono">{f.fd_number || '—'}</span> },
            { label: t('fd.principal'), right: true, cell: (f) => <Money value={f.principal} /> },
            { label: t('fd.rate'), right: true, cell: (f) => (f.rate_pct != null ? `${Number(f.rate_pct)}%` : '—') },
            { label: t('fd.start'), cell: (f) => fmtDate(f.start_date) },
            { label: t('fd.maturity_amount'), right: true, cell: (f) => (f.maturity_amount != null ? <Money value={f.maturity_amount} /> : '—') },
            { label: t('f.status'), cell: (f) => <><Badge tone={TONE_BY_STATUS[f.status]}>{t(`fdstatus.${f.status}`)}</Badge> <OriginBadges origin={null} needsReview={f.needs_review} /></> },
          ]}
        />
      )}
    </>
  );
}
