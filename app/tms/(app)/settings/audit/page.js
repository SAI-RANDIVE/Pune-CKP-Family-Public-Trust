import Link from 'next/link';
import { DataTable, FilterForm, PageHead, Pager } from '../../../../../components/tms/blocks';
import { Badge, Card, Empty, Money, SelectField, TextField } from '../../../../../components/tms/ui';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { Where, likeParam, one, pageOf, q, textParam } from '../../../../../lib/tms/db';
import { fmtDateTime } from '../../../../../lib/tms/format';
import { isRecordTable } from '../../../../../lib/tms/records';

export const dynamic = 'force-dynamic';

const PER_PAGE = 30;
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const pretty = (value) => JSON.stringify(value, null, 2);

/** Who did what, and when: every change with the record as it was before and after. */
export default async function AuditPage({ searchParams }) {
  await requireRole('admin');
  const { t } = await getI18n();
  const tab = searchParams?.tab === 'payments' ? 'payments' : 'actions';
  const page = pageOf(searchParams);

  if (tab === 'payments') {
    const { n: total } = await one('select count(*)::int as n from payment_events');
    const events = await q(
      `select e.id, e.event_type, e.source, e.amount, e.created_at, p.payer_name, p.receipt_no, p.is_test
         from payment_events e left join payments p on p.id = e.payment_id
        order by e.created_at desc limit ${PER_PAGE} offset ${(page - 1) * PER_PAGE}`);
    return (
      <>
        <PageHead title={t('aud.payments')} intro={t('aud.payments_intro')} crumbs={[{ href: '/settings', label: t('nav.settings') }, { href: '/settings/audit', label: t('set.audit') }, { label: t('aud.payments') }]}>
          <Link href="/settings/audit" className="tms-btn tms-btn--secondary">{t('set.audit')}</Link>
        </PageHead>
        {events.length === 0 ? <Empty title={t('aud.none')} /> : (
          <>
            <DataTable
              rows={events}
              columns={[
                { label: t('f.date'), cell: (e) => fmtDateTime(e.created_at) },
                { label: t('aud.action'), lead: true, cell: (e) => String(e.event_type).replace(/[._]/g, ' ') },
                { label: t('f.amount'), right: true, cell: (e) => (e.amount != null ? <Money value={e.amount} /> : '—') },
                { label: t('inc.from_whom'), cell: (e) => <>{e.payer_name || '—'} {e.is_test && <Badge tone="warn">{t('pay.test')}</Badge>}</> },
                { label: t('f.receipt_no'), cell: (e) => <span className="mono">{e.receipt_no || '—'}</span> },
                { label: t('aud.source'), cell: (e) => e.source },
              ]}
            />
            <Pager page={page} total={total} pageSize={PER_PAGE} base="/settings/audit" params={{ tab }} />
          </>
        )}
      </>
    );
  }

  const who = textParam(searchParams?.who, 80);
  const action = textParam(searchParams?.action, 60);
  const entity = /^[a-z_]{2,40}$/.test(String(searchParams?.entity || '')) ? searchParams.entity : '';
  const from = isIso(searchParams?.from) ? searchParams.from : '';
  const to = isIso(searchParams?.to) ? searchParams.to : '';
  const changes = searchParams?.changes === '1';

  const w = new Where();
  if (who) w.add('a.admin_email ilike ?', likeParam(who));
  if (action) w.add('a.action ilike ?', likeParam(action));
  if (entity) w.add('a.entity = ?', entity);
  if (from) w.add('a.created_at >= ?::date', from);
  if (to) w.add("a.created_at < (?::date + interval '1 day')", to);
  if (changes) w.conds.push('(a.before is not null or a.after is not null)');

  const [entities, { n: total }, rows] = await Promise.all([
    q('select distinct entity from audit_logs where entity is not null order by entity limit 60'),
    one(`select count(*)::int as n from audit_logs a ${w.sql}`, w.params),
    q(`select a.id, a.admin_email, a.action, a.entity, a.entity_id, a.detail, a.before, a.after, a.ip, a.created_at
         from audit_logs a ${w.sql} order by a.created_at desc limit ${PER_PAGE} offset ${(page - 1) * PER_PAGE}`, w.params),
  ]);

  return (
    <>
      <PageHead title={t('set.audit')} intro={t('aud.intro')} crumbs={[{ href: '/settings', label: t('nav.settings') }, { label: t('set.audit') }]}>
        <Link href="/settings/audit?tab=payments" className="tms-btn tms-btn--secondary">{t('aud.payments')}</Link>
      </PageHead>

      <FilterForm action="/settings/audit">
        <TextField label={t('aud.who')} name="who" type="search" defaultValue={who} placeholder="name@example.com" maxLength={80} />
        <TextField label={t('aud.action')} name="action" type="search" defaultValue={action} placeholder="income, merged, login" maxLength={60} />
        <SelectField label={t('aud.entity')} name="entity" defaultValue={entity} placeholder={t('c.all')} options={entities.map((e) => ({ value: e.entity, label: e.entity }))} />
        <TextField label={t('c.from_date')} name="from" type="date" defaultValue={from} />
        <TextField label={t('c.to_date')} name="to" type="date" defaultValue={to} />
        <SelectField label={t('aud.show')} name="changes" defaultValue={changes ? '1' : ''} options={[{ value: '', label: t('aud.everything') }, { value: '1', label: t('aud.changes_only') }]} />
      </FilterForm>

      {rows.length === 0 ? <Empty title={t('aud.none')} hint={t('c.try_filters')} /> : (
        <div className="tms-stack">
          {rows.map((a) => (
            <Card key={a.id}>
              <h2 style={{ fontSize: '1.1rem' }}>
                {String(a.action).replace(/_/g, ' ')}{' '}
                {/fail|denied/.test(a.action) && <Badge tone="error">{t('aud.failed')}</Badge>}
              </h2>
              <p className="muted">
                {fmtDateTime(a.created_at)} · {a.admin_email || t('aud.system')}{a.ip ? ` · ${a.ip}` : ''}
              </p>
              {a.entity && (
                <p>
                  {a.entity}{a.entity_id ? <>: <span className="mono">{a.entity_id}</span></> : null}{' '}
                  {a.entity_id && isRecordTable(a.entity) && <Link href={`/source/${a.entity}/${a.entity_id}`}>{t('rq.open_record')}</Link>}
                </p>
              )}
              {(a.detail || a.before || a.after) && (
                <details>
                  <summary>{t('aud.details')}</summary>
                  {a.detail && <><h3>{t('aud.detail')}</h3><pre className="tms-json">{pretty(a.detail)}</pre></>}
                  <div className="tms-grid tms-grid--2">
                    {a.before && <div><h3>{t('aud.before')}</h3><pre className="tms-json">{pretty(a.before)}</pre></div>}
                    {a.after && <div><h3>{t('aud.after')}</h3><pre className="tms-json">{pretty(a.after)}</pre></div>}
                  </div>
                </details>
              )}
            </Card>
          ))}
          <Pager page={page} total={total} pageSize={PER_PAGE} base="/settings/audit" params={{ who, action, entity, from, to, changes: changes ? '1' : '' }} />
        </div>
      )}
    </>
  );
}
