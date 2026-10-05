import Link from 'next/link';
import Icon from '../../../components/tms/icons';
import { Alert, Bars, Card, Stat } from '../../../components/tms/ui';
import { requireRole, can } from '../../../lib/tms/auth';
import { getI18n } from '../../../lib/tms/i18n/server';
import { one, q } from '../../../lib/tms/db';
import { currentFy, formatINR, formatNumber } from '../../../lib/tms/format';

export const dynamic = 'force-dynamic';

/** Home: the eight things trustees do most, four figures, and what needs attention. */
export default async function DashboardPage() {
  const admin = await requireRole('viewer');
  const { t } = await getI18n();
  const fy = currentFy();

  const [totals, alerts, byFy, byKind] = await Promise.all([
    one(
      `select
         (select coalesce(sum(amount), 0) from v_donations where fy = $1) as donations,
         (select count(*) from v_donations where fy = $1)::int as donation_count,
         (select coalesce(sum(amount), 0) from expenses where deleted_at is null and fy = $1) as expenses,
         (select count(*) from expenses where deleted_at is null and fy = $1)::int as expense_count,
         (select count(*) from memberships where deleted_at is null and status = 'active')::int as members,
         (select count(*) from v_fd_maturity_calendar where days_to_maturity between 0 and 90)::int as fd_due,
         (select coalesce(sum(coalesce(maturity_amount, principal)), 0) from v_fd_maturity_calendar where days_to_maturity between 0 and 90) as fd_due_amount`,
      [fy]),
    one(
      `select
         (select count(*) from v_membership_expiries_due where days_left between 0 and 90)::int as expiring,
         (select count(*) from v_membership_expiries_due where days_left < 0 and status = 'active')::int as expired,
         (select count(*) from v_fd_maturity_calendar where days_to_maturity < 0)::int as fd_past,
         (select count(*) from import_review_queue where status = 'open')::int as review_open,
         (select count(*) from import_review_queue where status = 'open' and severity = 'high')::int as review_high,
         (select count(*) from person_merge_candidates where status = 'open')::int as duplicates`),
    q('select fy, income, expense from v_income_vs_expense_by_fy order by fy desc limit 5'),
    q('select kind, total from v_income_by_fy_kind where fy = $1 order by total desc', [fy]),
  ]);

  const mayEnter = can(admin, 'enterMoney');
  const tiles = [
    mayEnter && { href: '/donations/new', icon: 'donate', title: t('tile.donation'), note: t('tile.donation_note') },
    { href: '/receipts', icon: 'receipt', title: t('tile.receipt'), note: t('tile.receipt_note') },
    { href: '/members', icon: 'people', title: t('tile.members'), note: t('tile.members_note') },
    mayEnter
      ? { href: '/expenses/new', icon: 'expense', title: t('tile.expense'), note: t('tile.expense_note') }
      : { href: '/expenses', icon: 'expense', title: t('nav.expenses'), note: t('tile.expense_view_note') },
    { href: '/deposits', icon: 'deposit', title: t('tile.deposits'), note: t('tile.deposits_note') },
    { href: '/schemes', icon: 'scheme', title: t('tile.schemes'), note: t('tile.schemes_note') },
    { href: '/reports', icon: 'report', title: t('tile.reports'), note: t('tile.reports_note') },
    can(admin, 'review')
      ? { href: '/review', icon: 'review', title: t('tile.review'), note: t('tile.review_note', { n: formatNumber(alerts.review_open) }) }
      : { href: '/events', icon: 'event', title: t('nav.events'), note: t('tile.events_note') },
    !mayEnter && { href: '/donations', icon: 'donate', title: t('nav.donations'), note: t('tile.donations_view_note') },
  ].filter(Boolean).slice(0, 8);

  const fyRows = [...byFy].reverse().map((r) => ({
    label: r.fy,
    values: [{ series: t('rep.c.income'), value: r.income }, { series: t('rep.c.expense'), value: r.expense }],
  }));
  const kindRows = byKind.map((r) => ({ label: t(`kind.${r.kind}`), values: [{ series: t('f.amount'), value: r.total }] }));

  return (
    <div className="tms-stack">
      <div>
        <h1 id="page-title">{t('dash.hello', { name: admin.name })}</h1>
        <p className="muted">{t('dash.intro')}</p>
      </div>

      <nav className="tms-tiles" aria-label={t('dash.tasks')}>
        {tiles.map((tile, i) => (
          <Link key={tile.href} href={tile.href} className={`tms-tile tms-tile--${i + 1}`}>
            <Icon name={tile.icon} size="2.4rem" />
            <span>{tile.title}<small>{tile.note}</small></span>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="dash-figures">
        <h2 id="dash-figures" style={{ marginBottom: '0.75rem' }}>{t('dash.figures', { fy })}</h2>
        <div className="tms-grid tms-grid--4">
          <Stat label={t('dash.donations')} value={formatINR(totals.donations)} note={t('dash.entries', { n: formatNumber(totals.donation_count) })} href={`/donations?fy=${fy}&kind=donation`} />
          <Stat label={t('dash.expenses')} value={formatINR(totals.expenses)} note={t('dash.vouchers', { n: formatNumber(totals.expense_count) })} href={`/expenses?fy=${fy}`} />
          <Stat label={t('dash.members')} value={formatNumber(totals.members)} note={t('dash.members_note')} href="/members?status=active" />
          <Stat label={t('dash.fd_due')} value={formatNumber(totals.fd_due)} note={totals.fd_due ? t('dash.fd_due_note', { amount: formatINR(totals.fd_due_amount) }) : t('dash.fd_none')} href="/deposits?view=calendar" />
        </div>
      </section>

      <section aria-labelledby="dash-alerts" className="tms-stack">
        <h2 id="dash-alerts">{t('dash.attention')}</h2>
        {alerts.fd_past > 0 && (
          <Alert tone="error" title={t('dash.a.fd_past', { n: alerts.fd_past })}>
            {t('dash.a.fd_past_body')} <Link href="/deposits?view=calendar">{t('dash.a.see_deposits')}</Link>
          </Alert>
        )}
        {(alerts.expiring > 0 || alerts.expired > 0) && (
          <Alert tone="warn" title={t('dash.a.expiring', { soon: alerts.expiring, past: alerts.expired })}>
            {t('dash.a.expiring_body')} <Link href="/members/expiring">{t('dash.a.see_expiring')}</Link>
          </Alert>
        )}
        {alerts.review_open > 0 && (
          <Alert tone="info" title={t('dash.a.review', { n: formatNumber(alerts.review_open), high: alerts.review_high })}>
            {t('dash.a.review_body')}{' '}
            {can(admin, 'review') && <Link href="/review">{t('dash.a.see_review')}</Link>}
          </Alert>
        )}
        {alerts.duplicates > 0 && can(admin, 'review') && (
          <Alert tone="info" title={t('dash.a.duplicates', { n: formatNumber(alerts.duplicates) })}>
            <Link href="/review/duplicates">{t('dash.a.see_duplicates')}</Link>
          </Alert>
        )}
        {!alerts.fd_past && !alerts.expiring && !alerts.expired && !alerts.review_open && (
          <Alert tone="ok">{t('dash.a.none')}</Alert>
        )}
      </section>

      <div className="tms-grid tms-grid--2">
        <Card title={t('dash.chart_fy')}>
          <Bars rows={fyRows} caption={t('dash.chart_fy_note')} empty={t('c.no_data')} />
        </Card>
        <Card title={t('dash.chart_kind', { fy })}>
          <Bars rows={kindRows} caption={t('dash.chart_kind_note')} empty={t('c.no_data')} />
        </Card>
      </div>
    </div>
  );
}
