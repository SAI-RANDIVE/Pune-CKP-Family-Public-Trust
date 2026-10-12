import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { DataTable, FilterForm, Flash, PageHead, Pager } from '../../../../components/tms/blocks';
import { Alert, Badge, Card, Empty, SelectField, Stat, TextField } from '../../../../components/tms/ui';
import { ConfirmSubmit } from '../../../../components/tms/client';
import { requireRole, can, hasOtpGrant } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { PAGE_SIZE, likeParam, one, oneOf, pageOf, q, textParam } from '../../../../lib/tms/db';
import { fmtDateTime, formatNumber, pick } from '../../../../lib/tms/format';
import { isEmailConfigured } from '../../../../lib/email';
import { sendMemberLogin, sendMemberLoginsBatch, setMemberLoginActive } from '../../../../lib/tms/actions/portal';

export const dynamic = 'force-dynamic';

const STATES = ['all', 'not_sent', 'sent', 'signed_in', 'no_email', 'off'];

/** The members' corner, from the trust's side: who has a login, who has used it, and sending logins by e-mail. */
export default async function PortalPage({ searchParams }) {
  const admin = await requireRole('admin', { readOnly: true });
  const { t, lang } = await getI18n();
  const term = textParam(searchParams?.q, 60);
  const state = oneOf(searchParams?.state, STATES, 'all');
  const page = pageOf(searchParams);

  const MEMBERS = `people p
      left join member_accounts a on a.person_id = p.id
     where p.deleted_at is null and p.merged_into_id is null
       and exists (select 1 from memberships m where m.person_id = p.id and m.deleted_at is null and m.status in ('active', 'lapsed'))`;
  const FILTER = `
       and ($1 = '' or p.name_en ilike $2 or p.name_mr ilike $2 or p.code ilike $2 or p.email ilike $2)
       and case $3
             when 'not_sent' then a.credentials_sent_at is null and p.email is not null and p.email <> ''
             when 'sent' then a.credentials_sent_at is not null and a.last_login_at is null
             when 'signed_in' then a.last_login_at is not null
             when 'no_email' then p.email is null or p.email = ''
             when 'off' then a.id is not null and not a.is_active
             else true end`;
  const params = [term, likeParam(term), state];

  const [counts, total, rows, granted] = await Promise.all([
    one(`select count(*)::int as members,
                count(*) filter (where p.email is not null and p.email <> '')::int as with_email,
                count(*) filter (where a.credentials_sent_at is not null)::int as sent,
                count(*) filter (where a.last_login_at is not null)::int as signed_in,
                count(*) filter (where a.credentials_sent_at is null and p.email is not null and p.email <> '')::int as waiting
           from ${MEMBERS}`),
    one(`select count(*)::int as n from ${MEMBERS} ${FILTER}`, params),
    q(`select p.id, p.code, p.name_en, p.name_mr, p.email, a.id as account_id, a.is_active, a.credentials_sent_at, a.last_login_at, a.must_change_password,
              (select m.code from memberships m where m.person_id = p.id and m.deleted_at is null
                order by (m.status = 'active') desc, m.expiry_date desc nulls first limit 1) as membership_code
         from ${MEMBERS} ${FILTER}
        order by p.name_en nulls last limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params),
    hasOtpGrant(admin),
  ]);
  const mailReady = isEmailConfigured();
  const maySendAll = can(admin, 'manageUsers');

  return (
    <>
      <PageHead title={t('x.pt.title')} intro={t('x.pt.intro')} crumbs={[{ href: '/members', label: t('nav.members') }, { label: t('x.pt.title') }]} />
      <Flash searchParams={searchParams} />
      {searchParams?.ok === 'batch_sent' && (
        <div style={{ marginBottom: '1rem' }}>
          <Alert tone={Number(searchParams.failed) > 0 ? 'warn' : 'ok'}>{t('x.pt.batch_result', { sent: Number(searchParams.sent) || 0, failed: Number(searchParams.failed) || 0 })}</Alert>
        </div>
      )}
      <div className="tms-stack">
        {!mailReady && <Alert tone="warn" title={t('x.pt.no_mail')}>{t('x.pt.no_mail_body')}</Alert>}
        <div className="tms-grid tms-grid--4">
          <Stat label={t('x.pt.members')} value={formatNumber(counts.members)} note={t('x.pt.with_email', { n: formatNumber(counts.with_email) })} />
          <Stat label={t('x.pt.sent')} value={formatNumber(counts.sent)} href="/portal?state=sent" />
          <Stat label={t('x.pt.signed_in')} value={formatNumber(counts.signed_in)} href="/portal?state=signed_in" />
          <Stat label={t('x.pt.waiting')} value={formatNumber(counts.waiting)} note={t('x.pt.waiting_note')} href="/portal?state=not_sent" />
        </div>

        <Card title={t('x.pt.how_title')}>
          <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.7 }}>
            <li>{t('x.pt.how1')}</li>
            <li>{t('x.pt.how2')}</li>
            <li>{t('x.pt.how3')}</li>
          </ol>
          {maySendAll && counts.waiting > 0 && (
            <form action={sendMemberLoginsBatch} className="no-print" style={{ marginTop: '1rem' }}>
              {!granted && <p className="tms-hint" style={{ marginBottom: '0.5rem' }}>{t('usr.needs_code')} <a href="/verify?next=%2Fportal">{t('otp.get_now')}</a></p>}
              <ConfirmSubmit
                label={t('x.pt.send_batch', { n: Math.min(40, counts.waiting) })} className="tms-btn" icon="mail"
                message={t('x.pt.confirm_batch', { n: Math.min(40, counts.waiting) })}
              />
              <p className="tms-hint" style={{ marginTop: '0.5rem' }}>{t('x.pt.batch_hint')}</p>
            </form>
          )}
        </Card>

        <FilterForm action="/portal">
          <TextField label={t('x.pt.search')} name="q" defaultValue={term} placeholder="Pradhan / SLV/MEM/0012" />
          <SelectField label={t('x.pt.state')} name="state" defaultValue={state} options={STATES.map((s) => ({ value: s, label: t(`x.pt.st.${s}`) }))} />
        </FilterForm>

        {rows.length === 0 ? <Empty title={t('x.pt.none')} hint={t('c.try_filters')} /> : (
          <DataTable
            rows={rows}
            columns={[
              { label: t('f.name'), lead: true, cell: (r) => <Link href={`/people/${r.id}`}>{pick(lang, r.name_mr, r.name_en)}</Link> },
              { label: t('x.pt.ids'), cell: (r) => <span className="mono">{r.membership_code}<br />{r.code}</span> },
              { label: t('f.email'), cell: (r) => r.email || <Badge tone="warn">{t('x.pt.st.no_email')}</Badge> },
              { label: t('x.pt.login'), cell: (r) => {
                if (!r.account_id || !r.credentials_sent_at) return <Badge tone="neutral">{t('x.pt.st.not_sent')}</Badge>;
                if (!r.is_active) return <Badge tone="error">{t('x.pt.st.off')}</Badge>;
                return r.last_login_at
                  ? <><Badge tone="ok">{t('x.pt.st.signed_in')}</Badge><br /><small className="muted">{fmtDateTime(r.last_login_at)}</small></>
                  : <><Badge tone="info">{t('x.pt.st.sent')}</Badge><br /><small className="muted">{fmtDateTime(r.credentials_sent_at)}</small></>;
              } },
              { label: '', cell: (r) => (
                <div className="tms-actions no-print">
                  {r.email && mailReady && (
                    <form action={sendMemberLogin}>
                      <input type="hidden" name="person_id" value={r.id} />
                      <input type="hidden" name="back" value="/portal" />
                      <ConfirmSubmit
                        label={r.credentials_sent_at ? t('x.pt.resend') : t('x.pt.send')} className="tms-btn tms-btn--small tms-btn--secondary"
                        message={t(r.credentials_sent_at ? 'x.pt.confirm_resend' : 'x.pt.confirm_send', { name: r.name_en || r.name_mr, email: r.email })}
                      />
                    </form>
                  )}
                  {r.account_id && r.credentials_sent_at && (
                    <form action={setMemberLoginActive}>
                      <input type="hidden" name="person_id" value={r.id} />
                      <input type="hidden" name="back" value="/portal" />
                      <input type="hidden" name="active" value={r.is_active ? 'false' : 'true'} />
                      <button type="submit" className="tms-btn tms-btn--small tms-btn--quiet">{r.is_active ? t('x.pt.switch_off') : t('x.pt.switch_on')}</button>
                    </form>
                  )}
                </div>
              ) },
            ]}
          />
        )}
        <Pager page={page} total={total.n} pageSize={PAGE_SIZE} base="/portal" params={{ q: term, state: state === 'all' ? '' : state }} />
      </div>
    </>
  );
}
