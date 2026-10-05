import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DataTable, Flash, OriginBadges, PageHead, SourceLink } from '../../../../../components/tms/blocks';
import { Alert, Badge, Card, Field, KeyValues, Money, SelectField, TextField } from '../../../../../components/tms/ui';
import { AmountInput, ConfirmSubmit, PrintButton, SubmitButton } from '../../../../../components/tms/client';
import { requireRole, can } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../lib/tms/db';
import { fmtDate, formatINR, pick, todayIso } from '../../../../../lib/tms/format';
import { TONE_BY_STATUS } from '../../../../../lib/tms/constants';
import { addDepositEvent, closeDeposit } from '../../../../../lib/tms/actions/assets';

export const dynamic = 'force-dynamic';

/** One fixed deposit: its terms, what it earned, and what happened to it. */
export default async function DepositPage({ params, searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  if (!isUuid(params.id)) notFound();

  const f = await one(
    `select f.*, (f.maturity_date - current_date) as days, fu.name_en as fund_en, fu.name_mr as fund_mr,
            prev.code as prev_code, nxt.id as next_id, nxt.code as next_code
       from fixed_deposits f
       left join funds fu on fu.id = f.fund_id
       left join fixed_deposits prev on prev.id = f.renewed_from_id
       left join lateral (select id, code from fixed_deposits n where n.renewed_from_id = f.id and n.deleted_at is null order by n.created_at limit 1) nxt on true
      where f.id = $1 and f.deleted_at is null`, [params.id]);
  if (!f) notFound();

  const [events, docs] = await Promise.all([
    q('select id, event_date, fy, kind, amount, label_as_written from fd_events where fixed_deposit_id = $1 and deleted_at is null order by event_date nulls last, created_at', [f.id]),
    q('select id, file_name, size_bytes from documents where record_table = $1 and record_id = $2 and deleted_at is null order by created_at', ['fixed_deposits', f.id]),
  ]);
  const total = (kind) => events.filter((e) => e.kind === kind).reduce((a, e) => a + Number(e.amount), 0);
  const running = ['active', 'unknown'].includes(f.status);
  const open = running || f.status === 'matured';
  const mayEnter = can(admin, 'enterMoney');

  return (
    <>
      <PageHead title={`${f.bank}: ${formatINR(f.principal)}`} intro={f.fd_number ? `${t('fd.number')} ${f.fd_number}` : undefined} crumbs={[{ href: '/deposits', label: t('fd.title') }, { label: f.code }]}>
        {mayEnter && open && <Link href={`/deposits/new?from=${f.id}`} className="tms-btn">{t('fd.renew')}</Link>}
        <PrintButton label={t('c.print')} />
      </PageHead>
      <Flash searchParams={searchParams} />

      <div className="tms-stack">
        {running && f.days != null && f.days < 0 && <Alert tone="error" title={t('fd.past_days', { n: -f.days })}>{t('fd.past_body')}</Alert>}
        {running && f.days != null && f.days >= 0 && f.days <= 90 && <Alert tone="warn">{t('fd.in_days', { n: f.days })}</Alert>}
        {f.needs_review && <Alert tone="warn">{t('c.needs_review_body')}</Alert>}

        <Card title={t('fd.details')}>
          <KeyValues items={[
            [t('f.status'), <Badge tone={TONE_BY_STATUS[f.status]}>{t(`fdstatus.${f.status}`)}</Badge>],
            [t('f.bank'), [f.bank, f.branch].filter(Boolean).join(', ')],
            [t('fd.number'), f.fd_number ? <span className="mono">{f.fd_number}</span> : ''],
            [t('fd.principal'), <strong className="num" style={{ fontSize: '1.4rem' }}>{formatINR(f.principal)}</strong>],
            [t('fd.rate'), f.rate_pct != null ? `${Number(f.rate_pct)}%` : ''],
            [t('fd.start'), fmtDate(f.start_date)],
            [t('fd.maturity'), fmtDate(f.maturity_date)],
            [t('fd.maturity_amount'), f.maturity_amount != null ? formatINR(f.maturity_amount) : ''],
            [t('fd.compounding'), f.compounding],
            [t('f.fund'), pick(lang, f.fund_mr, f.fund_en) || f.earmark_as_written],
            [t('fd.renewed_from'), f.renewed_from_id ? <Link href={`/deposits/${f.renewed_from_id}`}>{f.prev_code}</Link> : ''],
            [t('fd.renewed_as'), f.next_id ? <Link href={`/deposits/${f.next_id}`}>{f.next_code}</Link> : ''],
            [t('f.notes'), f.notes],
            [t('f.id'), <span className="mono">{f.code}</span>],
            [t('c.record'), <OriginBadges origin={f.origin} needsReview={f.needs_review} />],
          ]} />
          <div className="tms-actions no-print" style={{ marginTop: '1rem' }}><SourceLink table="fixed_deposits" id={f.id} /></div>
        </Card>

        <section aria-labelledby="fd-events">
          <h2 id="fd-events" style={{ marginBottom: '0.5rem' }}>{t('fd.events')}</h2>
          {events.length === 0 ? <p className="muted">{t('fd.no_events')}</p> : (
            <DataTable
              rows={events}
              columns={[
                { label: t('f.date'), cell: (e) => fmtDate(e.event_date) },
                { label: t('f.kind'), lead: true, cell: (e) => t(`fdevent.${e.kind}`) },
                { label: t('f.amount'), right: true, cell: (e) => <Money value={e.amount} /> },
                { label: t('f.fy'), cell: (e) => e.fy || '—' },
                { label: t('f.notes'), cell: (e) => e.label_as_written || '—' },
              ]}
            />
          )}
          <p className="tms-hint">{t('fd.totals', { interest: formatINR(total('interest')), tds: formatINR(total('tds')) })}</p>
        </section>

        {docs.length > 0 && (
          <Card title={t('doc.title')}>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {docs.map((d) => <li key={d.id}><a href={`/api/tms/documents/${d.id}`}>{d.file_name}</a></li>)}
            </ul>
          </Card>
        )}

        {mayEnter && (
          <div className="tms-grid tms-grid--2 no-print">
            <Card title={t('fd.add_event')}>
              <form action={addDepositEvent}>
                <input type="hidden" name="fixed_deposit_id" value={f.id} />
                <SelectField label={t('f.kind')} name="kind" required options={[{ value: 'interest', label: t('fdevent.interest') }, { value: 'tds', label: t('fdevent.tds') }]} />
                <TextField label={t('f.date')} name="event_date" type="date" required defaultValue={todayIso()} max={todayIso()} />
                <Field label={t('f.amount')} htmlFor="ev-amount"><AmountInput id="ev-amount" name="amount" required placeholder="3625" /></Field>
                <TextField label={t('f.notes')} name="label" optional={t('c.optional')} maxLength={200} placeholder={t('fd.event_ph')} />
                <SubmitButton>{t('c.save')}</SubmitButton>
              </form>
            </Card>

            {open && (
              <Card title={t('fd.close_title')}>
                <p className="muted" style={{ marginBottom: '0.75rem' }}>{t('fd.close_intro')}</p>
                <form action={closeDeposit}>
                  <input type="hidden" name="id" value={f.id} />
                  <SelectField
                    label={t('fd.close_what')} name="status" required
                    options={[...(running ? [{ value: 'matured', label: t('fd.mark_matured') }] : []), { value: 'closed', label: t('fd.mark_closed') }]}
                  />
                  <TextField label={t('f.date')} name="event_date" type="date" required defaultValue={todayIso()} max={todayIso()} />
                  <Field label={t('fd.received')} htmlFor="cl-amount" optional={t('c.optional')} hint={t('fd.received_hint')}>
                    <AmountInput id="cl-amount" name="amount" placeholder={f.maturity_amount ? String(Number(f.maturity_amount)) : '107450'} />
                  </Field>
                  <ConfirmSubmit label={t('fd.close_button')} className="tms-btn" message={t('fd.close_confirm', { bank: f.bank, amount: formatINR(f.principal) })} />
                </form>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
