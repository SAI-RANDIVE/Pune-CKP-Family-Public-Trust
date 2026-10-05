import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Icon from '../../../../../components/tms/icons';
import { DataTable, Flash, OriginBadges, PageHead, SourceLink } from '../../../../../components/tms/blocks';
import { Alert, Badge, Card, KeyValues, Money, SelectField, Stat, TextField } from '../../../../../components/tms/ui';
import { SubmitButton } from '../../../../../components/tms/client';
import { requireRole, can } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../lib/tms/db';
import { fmtDate, formatINR, formatNumber, pick } from '../../../../../lib/tms/format';
import { OFFICER_TITLES, TONE_BY_STATUS } from '../../../../../lib/tms/constants';
import { saveOfficer } from '../../../../../lib/tms/actions/people';

export const dynamic = 'force-dynamic';

/** Everything the trust knows about one person, on one page. */
export default async function PersonPage({ params, searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  if (!isUuid(params.id)) notFound();

  const p = await one('select * from people where id = $1', [params.id]);
  if (!p) notFound();
  if (p.merged_into_id) redirect(`/people/${p.merged_into_id}`);
  if (p.deleted_at) notFound();

  const seeIds = can(admin, 'seeIdNumbers');
  const mayEdit = can(admin, 'editPeople');
  const mayEnter = can(admin, 'enterMoney');

  const [variants, memberships, income, totals, disbursements, offices, paid, logins] = await Promise.all([
    q('select name from person_name_variants where person_id = $1 order by name limit 20', [p.id]),
    q(`select m.*, (select string_agg(n.number_as_written || coalesce(' (' || n.first_seen_fy || ')', ''), ', ' order by n.first_seen_fy nulls last)
                      from membership_numbers n where n.membership_id = m.id) as numbers
         from memberships m where m.person_id = $1 and m.deleted_at is null
        order by (m.status = 'active') desc, m.start_date desc nulls last`, [p.id]),
    q(`select i.id, i.code, i.entry_date, i.fy, i.amount, i.kind, i.mode, i.origin, i.needs_review,
              r.number_as_written as receipt_no, r.is_cancelled
         from income_entries i left join receipts r on r.id = i.receipt_id
        where i.person_id = $1 and i.deleted_at is null
        order by i.entry_date desc nulls last, i.created_at desc limit 60`, [p.id]),
    one(`select count(*)::int as n, coalesce(sum(amount), 0) as total,
                coalesce(sum(amount) filter (where kind in ('donation', 'csr_grant', 'sponsorship')), 0) as donated,
                min(entry_date) as first_on, max(entry_date) as last_on
           from income_entries where person_id = $1 and deleted_at is null and kind not in ('loan_received', 'refund_received')`, [p.id]),
    q(`select d.id, d.code, d.disbursed_on, d.fy, d.amount, d.status, d.scheme_id, s.name_en, s.name_mr
         from scheme_disbursements d join schemes s on s.id = d.scheme_id
        where d.person_id = $1 and d.deleted_at is null order by d.disbursed_on desc nulls last`, [p.id]),
    q(`select o.id, o.title_en, o.title_mr, o.from_date, o.to_date, a.name as login_name
         from trust_officers o left join admin_users a on a.id = o.admin_user_id
        where o.person_id = $1 and o.deleted_at is null order by o.to_date desc nulls first, o.from_date desc nulls last`, [p.id]),
    q(`select e.id, e.code, e.entry_date, e.amount, e.particulars from expenses e
        where e.payee_person_id = $1 and e.deleted_at is null order by e.entry_date desc nulls last limit 30`, [p.id]),
    can(admin, 'manageUsers') ? q('select id, name, email from admin_users where is_active order by name') : Promise.resolve([]),
  ]);

  const name = pick(lang, p.name_mr, p.name_en);
  const other = lang === 'mr' ? p.name_en : p.name_mr;

  return (
    <>
      <PageHead title={name} intro={other && other !== name ? other : undefined} crumbs={[{ href: '/people', label: t('people.title') }, { label: name }]}>
        {mayEnter && <Link href={`/donations/new?person=${p.id}`} className="tms-btn"><Icon name="donate" />{t('person.add_donation')}</Link>}
        {mayEnter && !memberships.some((m) => m.status === 'active') && (
          <Link href={`/members/new?person=${p.id}`} className="tms-btn tms-btn--secondary"><Icon name="plus" />{t('person.add_membership')}</Link>
        )}
        {mayEdit && <Link href={`/people/${p.id}/edit`} className="tms-btn tms-btn--secondary">{t('c.edit')}</Link>}
      </PageHead>
      <Flash searchParams={searchParams} />

      <div className="tms-stack">
        {p.needs_review && <Alert tone="warn">{t('person.needs_review')}</Alert>}

        <div className="tms-grid tms-grid--3">
          <Stat label={t('person.total_given')} value={formatINR(totals.donated)} note={t('person.total_note', { n: formatNumber(totals.n), total: formatINR(totals.total) })} />
          <Stat label={t('person.first_last')} value={totals.n ? fmtDate(totals.last_on) : '—'} note={totals.n ? t('person.first_on', { date: fmtDate(totals.first_on) }) : t('person.no_money')} />
          <Stat
            label={t('nav.membership')}
            value={memberships[0] ? t(`tier.${memberships[0].tier}`) : '—'}
            note={memberships[0] ? `${t(`status.${memberships[0].status}`)}${memberships[0].expiry_date ? ` · ${t('mem.till')} ${fmtDate(memberships[0].expiry_date)}` : ''}` : t('person.not_member')}
          />
        </div>

        <Card title={t('person.details')}>
          <KeyValues items={[
            [t('f.id'), <span key="c" className="mono">{p.code}</span>],
            [t('pf.roles'), (p.roles || []).map((r) => t(`prole.${r}`)).join(', ')],
            [t('f.phone'), [p.phone, p.phone_alt].filter(Boolean).join(', ')],
            [t('f.email'), p.email],
            [t('f.address'), [p.address, p.city, p.pincode].filter(Boolean).join(', ')],
            [t('pf.dob'), p.date_of_birth ? fmtDate(p.date_of_birth) : ''],
            [t('pf.blood'), p.blood_group],
            seeIds ? [t('f.pan'), p.pan ? <span key="p" className="mono">{p.pan}</span> : ''] : null,
            seeIds ? [t('f.aadhaar'), p.aadhaar ? <span key="a" className="mono">{p.aadhaar}</span> : ''] : null,
            [t('person.other_names'), variants.map((v) => v.name).filter((v) => v !== p.name_en).join('; ')],
            [t('f.notes'), p.notes],
            [t('c.record'), <OriginBadges key="o" origin={p.origin} needsReview={p.needs_review} />],
          ]} />
          {!seeIds && (p.pan || p.aadhaar) && <p className="tms-hint">{t('person.ids_hidden')}</p>}
          <div className="tms-actions no-print" style={{ marginTop: '1rem' }}><SourceLink table="people" id={p.id} /></div>
        </Card>

        <Card title={`${t('person.memberships')} (${memberships.length})`}>
          {memberships.length === 0 ? <p className="muted">{t('person.not_member')}</p> : (
            <div className="tms-stack">
              {memberships.map((m) => (
                <div key={m.id} style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
                  <h3>
                    {t(`tier.${m.tier}`)} <span className="mono">{m.code}</span>{' '}
                    <Badge tone={TONE_BY_STATUS[m.status]}>{t(`status.${m.status}`)}</Badge>{' '}
                    <OriginBadges origin={m.origin} needsReview={m.needs_review} />
                  </h3>
                  <KeyValues items={[
                    [t('mem.from'), m.start_date ? fmtDate(m.start_date) : ''],
                    [t('mem.till'), m.expiry_date ? fmtDate(m.expiry_date) : (m.tier === 'platinum' ? t('mem.lifetime') : '')],
                    [t('mem.dates_derived'), m.dates_derived ? (m.date_rule || t('c.yes')) : ''],
                    [t('mem.old_numbers'), m.numbers],
                    [t('mem.validity_written'), m.validity_as_written],
                    [t('mem.ended'), m.discontinued_on ? `${fmtDate(m.discontinued_on)} ${m.discontinued_reason || ''}` : (m.discontinued_reason || '')],
                    [t('f.notes'), m.notes],
                  ]} />
                  <div className="tms-actions no-print" style={{ marginTop: '0.75rem' }}>
                    {mayEnter && m.expiry_date && ['silver', 'gold'].includes(m.tier) && ['active', 'lapsed'].includes(m.status) && (
                      <Link href={`/members/renew/${m.id}`} className="tms-btn tms-btn--small">{t('mem.renew')}</Link>
                    )}
                    <SourceLink table="memberships" id={m.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <section aria-labelledby="p-income">
          <h2 id="p-income" style={{ marginBottom: '0.5rem' }}>{t('person.income')} ({formatNumber(totals.n)})</h2>
          {income.length === 0 ? <p className="muted">{t('person.no_money')}</p> : (
            <DataTable
              rows={income} hrefFor={(i) => `/donations/${i.id}`}
              columns={[
                { label: t('f.date'), lead: true, cell: (i) => fmtDate(i.entry_date) },
                { label: t('f.kind'), cell: (i) => t(`kind.${i.kind}`) },
                { label: t('f.amount'), right: true, cell: (i) => <Money value={i.amount} /> },
                { label: t('f.mode'), cell: (i) => (i.mode ? t(`mode.${i.mode}`) : '—') },
                { label: t('f.receipt_no'), cell: (i) => <><span className="mono">{i.receipt_no || '—'}</span> {i.is_cancelled && <Badge tone="error">{t('status.cancelled')}</Badge>}</> },
                { label: t('c.record'), cell: (i) => <OriginBadges origin={i.origin} needsReview={i.needs_review} /> },
              ]}
            />
          )}
        </section>

        {disbursements.length > 0 && (
          <section aria-labelledby="p-dsb">
            <h2 id="p-dsb" style={{ marginBottom: '0.5rem' }}>{t('person.disbursements')} ({disbursements.length})</h2>
            <DataTable
              rows={disbursements} hrefFor={(d) => `/schemes/${d.scheme_id}`}
              columns={[
                { label: t('f.scheme'), lead: true, cell: (d) => pick(lang, d.name_mr, d.name_en) },
                { label: t('f.date'), cell: (d) => fmtDate(d.disbursed_on) },
                { label: t('f.amount'), right: true, cell: (d) => <Money value={d.amount} /> },
                { label: t('f.status'), cell: (d) => <Badge tone={TONE_BY_STATUS[d.status]}>{t(`dstatus.${d.status}`)}</Badge> },
                { label: t('f.id'), cell: (d) => <span className="mono">{d.code}</span> },
              ]}
            />
          </section>
        )}

        {paid.length > 0 && (
          <section aria-labelledby="p-paid">
            <h2 id="p-paid" style={{ marginBottom: '0.5rem' }}>{t('person.paid_to')} ({paid.length})</h2>
            <DataTable
              rows={paid} hrefFor={(e) => `/expenses/${e.id}`}
              columns={[
                { label: t('f.date'), lead: true, cell: (e) => fmtDate(e.entry_date) },
                { label: t('exp.particulars'), cell: (e) => e.particulars || '—' },
                { label: t('f.amount'), right: true, cell: (e) => <Money value={e.amount} /> },
                { label: t('f.id'), cell: (e) => <span className="mono">{e.code}</span> },
              ]}
            />
          </section>
        )}

        <Card title={`${t('person.offices')} (${offices.length})`}>
          {offices.length === 0 ? <p className="muted">{t('person.no_office')}</p> : (
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {offices.map((o) => (
                <li key={o.id}>
                  <strong>{pick(lang, o.title_mr, o.title_en)}</strong>{' '}
                  {o.from_date ? fmtDate(o.from_date) : t('c.unknown')} – {o.to_date ? fmtDate(o.to_date) : t('off.current')}
                  {o.login_name ? ` · ${t('off.login')}: ${o.login_name}` : ''}
                </li>
              ))}
            </ul>
          )}
          {can(admin, 'manageOfficers') && (
            <details className="no-print" style={{ marginTop: '0.75rem' }}>
              <summary>{t('off.add')}</summary>
              <form action={saveOfficer} style={{ maxWidth: '30rem', marginTop: '0.75rem' }}>
                <input type="hidden" name="person_id" value={p.id} />
                <SelectField label={t('off.title')} name="title" required options={OFFICER_TITLES.map((o) => ({ value: o.key, label: lang === 'mr' ? o.mr : o.en }))} />
                <TextField label={t('off.from')} name="from_date" type="date" optional={t('c.optional')} />
                <TextField label={t('off.to')} name="to_date" type="date" optional={t('c.optional')} hint={t('off.to_hint')} />
                {logins.length > 0 && (
                  <SelectField label={t('off.login')} name="admin_user_id" optional={t('c.optional')} placeholder={t('c.none')} options={logins.map((a) => ({ value: a.id, label: `${a.name} (${a.email})` }))} />
                )}
                <SubmitButton>{t('c.save')}</SubmitButton>
              </form>
            </details>
          )}
        </Card>
      </div>
    </>
  );
}
