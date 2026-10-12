import Link from 'next/link';
import Icon from '../../../components/tms/icons';
import { Alert, Badge, Bars, Card, KeyValues, Stat } from '../../../components/tms/ui';
import { requireRole, can } from '../../../lib/tms/auth';
import { canChange, canSee } from '../../../lib/tms/access';
import { getI18n } from '../../../lib/tms/i18n/server';
import { one, q } from '../../../lib/tms/db';
import { currentFy, fmtDate, fmtDateTime, formatINR, formatNumber, pick } from '../../../lib/tms/format';
import { OFFICER_TITLES } from '../../../lib/tms/constants';
import { upcomingOccasions } from '../../../lib/greetings';

export const dynamic = 'force-dynamic';

const none = Promise.resolve(null);
const empty = Promise.resolve([]);

/**
 * Home. The things trustees do most as large tiles, then the state of the
 * trust at a glance: this year's money month by month, the bank accounts and
 * deposits, the members, the coming events, what the bank check found and
 * what needs attention. Each block appears only for logins allowed to see
 * that section, so a restricted login gets a shorter, still complete, page.
 */
export default async function DashboardPage() {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  const fy = currentFy();
  const sees = (area) => canSee(admin, area);
  const money = sees('donations') || sees('expenses');

  const [totals, months, byKind, heads, banks, deposits, members, expiring, events, bankCheck, alerts, activity] = await Promise.all([
    money ? one(
      `select
         (select coalesce(sum(amount), 0) from v_income where fy = $1) as income,
         (select coalesce(sum(amount), 0) from v_donations where fy = $1) as donations,
         (select count(*) from v_donations where fy = $1)::int as donation_count,
         (select coalesce(sum(amount), 0) from expenses where deleted_at is null and fy = $1) as expenses,
         (select count(*) from expenses where deleted_at is null and fy = $1)::int as expense_count,
         (select coalesce(sum(amount), 0) from v_income where fy = $2) as income_prev,
         (select coalesce(sum(amount), 0) from expenses where deleted_at is null and fy = $2) as expenses_prev`,
      [fy, `${Number(fy.slice(0, 4)) - 1}-${fy.slice(2, 4)}`]) : none,
    money ? q('select cal_year, cal_month, income, expense from v_income_vs_expense_by_month where fy = $1 order by cal_year, cal_month', [fy]) : empty,
    sees('donations') ? q('select kind, total from v_income_by_fy_kind where fy = $1 order by total desc', [fy]) : empty,
    sees('expenses') ? q(
      `select coalesce(c.name_en, e.head_as_written, 'Other') as name_en, c.name_mr, sum(e.amount) as total
         from expenses e left join categories c on c.id = e.category_id
        where e.deleted_at is null and e.fy = $1 group by 1, 2 order by total desc limit 6`, [fy]) : empty,
    sees('bank') ? q(
      `select b.id, b.bank, b.number_masked, last.balance, last.txn_date
         from bank_accounts b
         join lateral (select balance, txn_date from bank_transactions t
                        where t.bank_account_id = b.id and t.deleted_at is null and t.balance is not null
                        order by t.txn_date desc, t.seq_in_statement desc nulls last limit 1) last on true
        where b.is_active order by b.code`) : empty,
    sees('deposits') ? one(
      `select count(*) filter (where status = 'active')::int as active_n,
              coalesce(sum(principal) filter (where status = 'active'), 0) as active_amount,
              (select count(*) from v_fd_maturity_calendar where days_to_maturity between 0 and 90)::int as due_n,
              (select coalesce(sum(coalesce(maturity_amount, principal)), 0) from v_fd_maturity_calendar where days_to_maturity between 0 and 90) as due_amount,
              (select count(*) from v_fd_maturity_calendar where days_to_maturity < 0)::int as past_n
         from fixed_deposits where deleted_at is null`) : none,
    sees('members') ? one(
      `select count(*) filter (where status = 'active')::int as active,
              count(*) filter (where status = 'active' and tier = 'silver')::int as silver,
              count(*) filter (where status = 'active' and tier = 'gold')::int as gold,
              count(*) filter (where status = 'active' and tier = 'platinum')::int as platinum,
              count(*) filter (where status = 'lapsed')::int as lapsed,
              count(*) filter (where start_date >= (select start_date from fiscal_years where label = $1))::int as joined,
              (select count(*) from member_accounts where last_login_at is not null)::int as portal_users
         from memberships where deleted_at is null`, [fy]) : none,
    sees('members') ? q(
      `select id, code, tier, expiry_date, days_left, name_en, name_mr from v_membership_expiries_due
        where status = 'active' order by days_left limit 6`) : empty,
    sees('events') ? q(
      `select e.id, e.code, e.name_en, e.name_mr, e.event_date, e.is_published, e.registration_open, e.capacity,
              (select count(*)::int from event_registrations r where r.event_id = e.id and r.status <> 'cancelled') as regs,
              (select coalesce(sum(1 + r.guests), 0)::int from event_registrations r where r.event_id = e.id and r.status <> 'cancelled') as heads
         from events e
        where e.deleted_at is null and (e.event_date >= current_date or e.registration_open)
        order by e.event_date nulls last limit 5`) : empty,
    sees('bank') ? one(
      `select count(*) filter (where status in ('matched', 'matched_group'))::int as ok,
              count(*) filter (where status in ('unmatched', 'ambiguous'))::int as open,
              coalesce(sum(coalesce(e.bank_amount, e.amount)) filter (where v.status in ('unmatched', 'ambiguous')), 0) as open_amount,
              max(v.checked_at) as at
         from expense_verifications v join expenses e on e.id = v.expense_id where e.deleted_at is null`) : none,
    one(
      `select
         (select count(*) from v_membership_expiries_due where days_left between 0 and 90)::int as expiring,
         (select count(*) from v_membership_expiries_due where days_left < 0 and status = 'active')::int as expired,
         (select count(*) from import_review_queue where status = 'open')::int as review_open,
         (select count(*) from import_review_queue where status = 'open' and severity = 'high')::int as review_high,
         (select count(*) from person_merge_candidates where status = 'open')::int as duplicates`),
    can(admin, 'viewAudit') ? q(
      `select a.action, a.entity, a.created_at, coalesce(u.name, a.admin_email, '') as who
         from audit_logs a left join admin_users u on u.id = a.admin_id
        where a.action not in ('login_success', 'permission_denied') order by a.created_at desc limit 8`) : empty,
  ]);

  // The desk beyond the books: occasions, meetings, what members are saying, and a few things worth noticing.
  const [occasions, desk, insights] = await Promise.all([
    sees('members') ? upcomingOccasions(10).catch(() => []) : empty,
    one(
      `select
         (select count(*) from feedback where status = 'new')::int as feedback_new,
         (select count(*) from polls where is_published and deleted_at is null and now() between opens_at and closes_at)::int as polls_open,
         (select count(*) from meeting_actions a join meetings m on m.id = a.meeting_id where not a.done and m.deleted_at is null)::int as actions_open,
         (select count(*) from meeting_actions a join meetings m on m.id = a.meeting_id where not a.done and m.deleted_at is null and a.due_on < current_date)::int as actions_late,
         (select min(next_meeting_on) from meetings where deleted_at is null and next_meeting_on >= current_date) as next_meeting,
         (select max(held_on) from meetings where deleted_at is null) as last_meeting,
         (select count(*) from family_links where status = 'confirmed')::int as family_links,
         (select count(*) from member_accounts where credentials_sent_at is not null and last_login_at is null)::int as logins_unused`),
    money ? one(
      `with this_fy as (select start_date, end_date from fiscal_years where label = $1),
            prev as (select start_date from fiscal_years where label = $2)
       select
         -- same stretch of last year, so the comparison is like for like
         (select coalesce(sum(i.amount), 0) from v_income i, prev where i.fy = $2 and i.entry_date <= prev.start_date + (current_date - (select start_date from this_fy))) as income_same_period,
         (select coalesce(sum(e.amount), 0) from expenses e, prev where e.deleted_at is null and e.fy = $2 and e.entry_date <= prev.start_date + (current_date - (select start_date from this_fy))) as expense_same_period,
         -- people who gave last year and have not given this year
         (select count(distinct d.person_id) from v_donations d where d.fy = $2 and d.person_id is not null
            and not exists (select 1 from v_donations n where n.fy = $1 and n.person_id = d.person_id))::int as donors_not_back,
         (select count(distinct person_id) from v_donations where fy = $1 and person_id is not null)::int as donors_now,
         (select max(amount) from expenses where deleted_at is null and fy = $1) as largest_expense`,
      [fy, `${Number(fy.slice(0, 4)) - 1}-${fy.slice(2, 4)}`]).catch(() => null) : none,
  ]);

  const mayEnter = can(admin, 'enterMoney');
  const mayReview = can(admin, 'review') && sees('review');
  const tiles = [
    mayEnter && canChange(admin, 'donations') && { href: '/donations/new', icon: 'donate', title: t('tile.donation'), note: t('tile.donation_note') },
    sees('donations') && { href: '/receipts', icon: 'receipt', title: t('tile.receipt'), note: t('tile.receipt_note') },
    sees('members') && { href: '/members', icon: 'people', title: t('tile.members'), note: t('tile.members_note') },
    sees('expenses') && (mayEnter && canChange(admin, 'expenses')
      ? { href: '/expenses/new', icon: 'expense', title: t('tile.expense'), note: t('tile.expense_note') }
      : { href: '/expenses', icon: 'expense', title: t('nav.expenses'), note: t('tile.expense_view_note') }),
    sees('events') && { href: '/events', icon: 'event', title: t('nav.events'), note: t('x.dash.events_note') },
    sees('events') && { href: '/planner', icon: 'scheme', title: t('x.pl.title'), note: t('x.dash.planner_note') },
    sees('deposits') && { href: '/deposits', icon: 'deposit', title: t('tile.deposits'), note: t('tile.deposits_note') },
    sees('schemes') && { href: '/schemes', icon: 'scheme', title: t('tile.schemes'), note: t('tile.schemes_note') },
    sees('reports') && { href: '/reports', icon: 'report', title: t('tile.reports'), note: t('tile.reports_note') },
    sees('meetings') && { href: '/meetings', icon: 'review', title: t('x.mt.title'), note: t('x.dash.meetings_note') },
    sees('community') && { href: '/polls', icon: 'report', title: t('x.po.title'), note: t('x.dash.polls_note', { n: desk.polls_open }) },
    sees('community') && { href: '/feedback', icon: 'mail', title: t('x.fb.title'), note: t('x.dash.feedback_note', { n: desk.feedback_new }) },
    sees('bank') && { href: '/bank', icon: 'bank', title: t('x.bk.title'), note: t('x.bk.tile') },
    can(admin, 'review') && sees('members') && { href: '/portal', icon: 'mail', title: t('x.pt.title'), note: t('x.dash.portal_note') },
    mayReview && { href: '/review', icon: 'review', title: t('tile.review'), note: t('tile.review_note', { n: formatNumber(alerts.review_open) }) },
  ].filter(Boolean);

  const monthName = (y, m) => new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(lang === 'mr' ? 'mr-IN' : 'en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const monthRows = months.map((r) => ({
    label: monthName(r.cal_year, r.cal_month),
    values: [
      ...(sees('donations') ? [{ series: t('rep.c.income'), value: r.income }] : []),
      ...(sees('expenses') ? [{ series: t('rep.c.expense'), value: r.expense }] : []),
    ],
  }));
  const kindRows = byKind.map((r) => ({ label: t(`kind.${r.kind}`), values: [{ series: t('f.amount'), value: r.total }] }));
  const headRows = heads.map((r) => ({ label: pick(lang, r.name_mr, r.name_en), values: [{ series: t('f.amount'), value: r.total }] }));
  const surplus = totals ? Number(totals.income) - Number(totals.expenses) : 0;
  const title = OFFICER_TITLES.find((o) => o.key === admin.designation);
  const change = (now, before) => {
    const b = Number(before);
    if (!b) return '';
    const pct = Math.round(((Number(now) - b) / b) * 100);
    return t('x.dash.vs_last', { pct: `${pct > 0 ? '+' : ''}${pct}` });
  };

  return (
    <div className="tms-stack">
      <div>
        <h1 id="page-title">{t('dash.hello', { name: admin.name })}</h1>
        <p className="muted">
          {title ? `${lang === 'mr' ? title.mr : title.en} · ` : ''}{t(`role.${admin.role}`)} · {t('dash.intro')}
        </p>
      </div>

      <nav className="tms-tiles" aria-label={t('dash.tasks')}>
        {tiles.map((tile, i) => (
          <Link key={tile.href} href={tile.href} className={`tms-tile tms-tile--${(i % 8) + 1}`}>
            <Icon name={tile.icon} size="2.4rem" />
            <span>{tile.title}<small>{tile.note}</small></span>
          </Link>
        ))}
      </nav>

      {totals && (
        <section aria-labelledby="dash-figures">
          <h2 id="dash-figures" style={{ marginBottom: '0.75rem' }}>{t('dash.figures', { fy })}</h2>
          <div className="tms-grid tms-grid--4">
            {sees('donations') && <Stat label={t('x.dash.income')} value={formatINR(totals.income)} note={change(totals.income, totals.income_prev)} href={`/reports/income-kind?fy=${fy}`} />}
            {sees('donations') && <Stat label={t('dash.donations')} value={formatINR(totals.donations)} note={t('dash.entries', { n: formatNumber(totals.donation_count) })} href={`/donations?fy=${fy}&kind=donation`} />}
            {sees('expenses') && <Stat label={t('dash.expenses')} value={formatINR(totals.expenses)} note={`${t('dash.vouchers', { n: formatNumber(totals.expense_count) })} ${change(totals.expenses, totals.expenses_prev)}`} href={`/expenses?fy=${fy}`} />}
            {sees('donations') && sees('expenses') && (
              <div className={`tms-stat ${surplus >= 0 ? 'tms-stat--ok' : 'tms-stat--bad'}`}>
                <div className="k">{surplus >= 0 ? t('x.dash.surplus') : t('x.dash.deficit')}</div>
                <div className="v">{formatINR(Math.abs(surplus))}</div>
                <div className="n">{t('x.dash.surplus_note')}</div>
              </div>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="dash-alerts" className="tms-stack">
        <h2 id="dash-alerts">{t('dash.attention')}</h2>
        {deposits?.past_n > 0 && (
          <Alert tone="error" title={t('dash.a.fd_past', { n: deposits.past_n })}>
            {t('dash.a.fd_past_body')} <Link href="/deposits?view=calendar">{t('dash.a.see_deposits')}</Link>
          </Alert>
        )}
        {bankCheck?.open > 0 && (
          <Alert tone="warn" title={t('x.dash.bank_open', { n: formatNumber(bankCheck.open), amount: formatINR(bankCheck.open_amount) })}>
            {t('x.dash.bank_open_body')} <Link href="/bank?status=unmatched">{t('x.dash.see_bank')}</Link>
          </Alert>
        )}
        {sees('members') && (alerts.expiring > 0 || alerts.expired > 0) && (
          <Alert tone="warn" title={t('dash.a.expiring', { soon: alerts.expiring, past: alerts.expired })}>
            {t('dash.a.expiring_body')} <Link href="/members/expiring">{t('dash.a.see_expiring')}</Link>
          </Alert>
        )}
        {mayReview && alerts.review_open > 0 && (
          <Alert tone="info" title={t('dash.a.review', { n: formatNumber(alerts.review_open), high: alerts.review_high })}>
            {t('dash.a.review_body')} <Link href="/review">{t('dash.a.see_review')}</Link>
          </Alert>
        )}
        {mayReview && alerts.duplicates > 0 && (
          <Alert tone="info" title={t('dash.a.duplicates', { n: formatNumber(alerts.duplicates) })}>
            <Link href="/review/duplicates">{t('dash.a.see_duplicates')}</Link>
          </Alert>
        )}
        {!(deposits?.past_n > 0) && !(bankCheck?.open > 0) && !alerts.expiring && !alerts.expired && !(mayReview && alerts.review_open) && (
          <Alert tone="ok">{t('dash.a.none')}</Alert>
        )}
      </section>

      {insights && totals && (
        <Card title={t('x.dash.notice')}>
          <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.9 }}>
            {sees('donations') && Number(insights.income_same_period) > 0 && (
              <li>{t(Number(totals.income) >= Number(insights.income_same_period) ? 'x.ins.income_up' : 'x.ins.income_down', {
                now: formatINR(totals.income), then: formatINR(insights.income_same_period),
                pct: Math.abs(Math.round(((Number(totals.income) - Number(insights.income_same_period)) / Number(insights.income_same_period)) * 100)),
              })}</li>
            )}
            {sees('expenses') && Number(insights.expense_same_period) > 0 && (
              <li>{t(Number(totals.expenses) > Number(insights.expense_same_period) ? 'x.ins.expense_up' : 'x.ins.expense_down', {
                now: formatINR(totals.expenses), then: formatINR(insights.expense_same_period),
                pct: Math.abs(Math.round(((Number(totals.expenses) - Number(insights.expense_same_period)) / Number(insights.expense_same_period)) * 100)),
              })}</li>
            )}
            {sees('donations') && insights.donors_not_back > 0 && (
              <li>{t('x.ins.donors_not_back', { n: formatNumber(insights.donors_not_back), now: formatNumber(insights.donors_now) })} <Link href={`/reports/donors?fy=${fy}`}>{t('rep.donors')}</Link></li>
            )}
            {sees('expenses') && Number(insights.largest_expense) > 0 && Number(totals.expenses) > 0 && Number(insights.largest_expense) / Number(totals.expenses) > 0.25 && (
              <li>{t('x.ins.one_big_expense', { amount: formatINR(insights.largest_expense), pct: Math.round((Number(insights.largest_expense) / Number(totals.expenses)) * 100) })}</li>
            )}
            {sees('members') && desk.logins_unused > 0 && <li>{t('x.ins.logins_unused', { n: formatNumber(desk.logins_unused) })} <Link href="/portal?state=sent">{t('x.pt.title')}</Link></li>}
            {sees('meetings') && desk.actions_late > 0 && <li>{t('x.ins.actions_late', { n: formatNumber(desk.actions_late) })} <Link href="/meetings">{t('x.mt.title')}</Link></li>}
            {sees('community') && desk.feedback_new > 0 && <li>{t('x.ins.feedback_new', { n: formatNumber(desk.feedback_new) })} <Link href="/feedback?status=new">{t('x.fb.title')}</Link></li>}
          </ul>
          <p className="tms-hint">{t('x.ins.note')}</p>
        </Card>
      )}

      <div className="tms-grid tms-grid--2">
        {sees('members') && (
          <Card title={t('x.dash.occasions')}>
            {occasions.length === 0 ? <p className="muted">{t('x.dash.no_occasions')}</p> : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {occasions.slice(0, 8).map((o, i) => (
                  <li key={i} style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--line)' }}>
                    <Link href={`/people/${o.id}`}>{pick(lang, o.name_mr, o.name)}</Link>{' '}
                    <span className="muted">· {t(`x.dash.oc.${o.kind}`)} · {fmtDate(o.next_on)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="tms-hint">{t('x.dash.occasions_note')}</p>
          </Card>
        )}
        {(sees('meetings') || sees('community')) && (
          <Card title={t('x.dash.desk')}>
            <KeyValues items={[
              sees('meetings') ? [t('x.mt.next'), desk.next_meeting ? fmtDate(desk.next_meeting) : t('x.mt.next_none')] : null,
              sees('meetings') ? [t('x.dash.last_meeting'), desk.last_meeting ? fmtDate(desk.last_meeting) : ''] : null,
              sees('meetings') ? [t('x.mt.open_actions'), desk.actions_open ? `${formatNumber(desk.actions_open)}${desk.actions_late ? ` (${t('x.dash.late', { n: desk.actions_late })})` : ''}` : formatNumber(0)] : null,
              sees('community') ? [t('x.dash.polls_open'), formatNumber(desk.polls_open)] : null,
              sees('community') ? [t('x.dash.feedback_new'), formatNumber(desk.feedback_new)] : null,
              sees('members') ? [t('x.dash.families'), formatNumber(desk.family_links)] : null,
            ]} />
            <p className="tms-hint">
              {sees('meetings') && <Link href="/meetings">{t('x.mt.title')}</Link>}{sees('meetings') && sees('community') && ' · '}
              {sees('community') && <><Link href="/polls">{t('x.po.title')}</Link> · <Link href="/feedback">{t('x.fb.title')}</Link></>}
            </p>
          </Card>
        )}
      </div>

      {monthRows.length > 0 && (
        <Card title={t('x.dash.months', { fy })}>
          <Bars rows={monthRows} caption={t('x.dash.months_note')} empty={t('c.no_data')} />
        </Card>
      )}

      <div className="tms-grid tms-grid--2">
        {sees('bank') && (
          <Card title={t('x.dash.banks')}>
            {banks.length === 0 ? <p className="muted">{t('c.no_data')}</p> : (
              <KeyValues items={banks.map((b) => [
                `${b.bank}${b.number_masked ? ` (${b.number_masked})` : ''}`,
                <span key={b.id}><strong className="num">{formatINR(b.balance)}</strong><br /><small className="muted">{t('x.dash.as_on', { date: fmtDate(b.txn_date) })}</small></span>,
              ])} />
            )}
            <p className="tms-hint">{t('x.dash.banks_note')} <Link href="/reports/banks">{t('rep.banks')}</Link></p>
          </Card>
        )}
        {deposits && (
          <Card title={t('x.dash.deposits')}>
            <KeyValues items={[
              [t('x.dash.fd_active'), <span key="a"><strong className="num">{formatINR(deposits.active_amount)}</strong> · {formatNumber(deposits.active_n)}</span>],
              [t('dash.fd_due'), deposits.due_n ? <span key="d"><strong className="num">{formatINR(deposits.due_amount)}</strong> · {formatNumber(deposits.due_n)}</span> : t('dash.fd_none')],
              [t('x.dash.fd_past'), deposits.past_n ? formatNumber(deposits.past_n) : ''],
            ]} />
            <p className="tms-hint"><Link href="/deposits?view=calendar">{t('dash.a.see_deposits')}</Link></p>
          </Card>
        )}
        {members && (
          <Card title={t('x.dash.members')}>
            <KeyValues items={[
              [t('dash.members'), <strong key="m" className="num">{formatNumber(members.active)}</strong>],
              [t('x.dash.by_tier'), `${t('tier.silver')} ${formatNumber(members.silver)} · ${t('tier.gold')} ${formatNumber(members.gold)} · ${t('tier.platinum')} ${formatNumber(members.platinum)}`],
              [t('x.dash.joined', { fy }), formatNumber(members.joined)],
              [t('x.dash.lapsed'), formatNumber(members.lapsed)],
              [t('x.dash.portal_users'), formatNumber(members.portal_users)],
            ]} />
            {expiring.length > 0 && (
              <>
                <h3 style={{ margin: '1rem 0 0.5rem' }}>{t('x.dash.expiring_next')}</h3>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {expiring.map((m) => (
                    <li key={m.id} style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--line)' }}>
                      <Link href={`/members/renew/${m.id}`}>{pick(lang, m.name_mr, m.name_en)}</Link>{' '}
                      <span className="muted">· {t(`tier.${m.tier}`)} · {fmtDate(m.expiry_date)}</span>{' '}
                      <Badge tone={m.days_left < 0 ? 'error' : 'warn'}>{m.days_left < 0 ? t('x.dash.days_over', { n: -m.days_left }) : t('x.dash.days_left', { n: m.days_left })}</Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}
        {sees('events') && (
          <Card title={t('x.dash.events')}>
            {events.length === 0 ? <p className="muted">{t('x.dash.no_events')}</p> : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {events.map((e) => (
                  <li key={e.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--line)' }}>
                    <Link href={`/events/${e.id}/manage`}><strong>{pick(lang, e.name_mr, e.name_en)}</strong></Link>
                    <br />
                    <span className="muted">{e.event_date ? fmtDate(e.event_date) : '—'} · {t('x.dash.regs', { n: formatNumber(e.regs), heads: formatNumber(e.heads) })}{e.capacity ? ` / ${formatNumber(e.capacity)}` : ''}</span>{' '}
                    {e.is_published ? <Badge tone="ok">{t('x.ev.on_site')}</Badge> : <Badge tone="neutral">{t('x.ev.not_on_site')}</Badge>}
                  </li>
                ))}
              </ul>
            )}
            <p className="tms-hint"><Link href="/events">{t('x.dash.all_events')}</Link></p>
          </Card>
        )}
        {kindRows.length > 0 && (
          <Card title={t('dash.chart_kind', { fy })}>
            <Bars rows={kindRows} caption={t('dash.chart_kind_note')} empty={t('c.no_data')} />
          </Card>
        )}
        {headRows.length > 0 && (
          <Card title={t('x.dash.heads', { fy })}>
            <Bars rows={headRows} caption={t('x.dash.heads_note')} empty={t('c.no_data')} />
          </Card>
        )}
        {bankCheck?.at && (
          <Card title={t('x.bk.title')}>
            <KeyValues items={[
              [t('x.dash.bank_ok'), <strong key="o" className="num">{formatNumber(bankCheck.ok)}</strong>],
              [t('x.dash.bank_todo'), bankCheck.open ? `${formatNumber(bankCheck.open)} · ${formatINR(bankCheck.open_amount)}` : formatNumber(0)],
              [t('x.dash.bank_when'), fmtDateTime(bankCheck.at)],
            ]} />
            <p className="tms-hint"><Link href="/bank">{t('x.dash.see_bank')}</Link></p>
          </Card>
        )}
        {activity.length > 0 && (
          <Card title={t('x.dash.activity')}>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {activity.map((a, i) => (
                <li key={i} style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--line)' }}>
                  <strong>{String(a.action).replace(/_/g, ' ')}</strong>
                  <br /><span className="muted">{a.who} · {fmtDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
            <p className="tms-hint"><Link href="/settings/audit">{t('x.dash.all_activity')}</Link></p>
          </Card>
        )}
      </div>
    </div>
  );
}
