import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icon from '../../../../../../components/tms/icons';
import { DataTable, Flash, PageHead } from '../../../../../../components/tms/blocks';
import { Alert, Badge, Card, Empty, SelectField, Stat, TextField } from '../../../../../../components/tms/ui';
import { ConfirmSubmit, SubmitButton } from '../../../../../../components/tms/client';
import EventForm from '../../../../../../components/tms/EventForm';
import MediaUploader from '../../../../../../components/tms/MediaUploader';
import { requireRole, can } from '../../../../../../lib/tms/auth';
import { canChange } from '../../../../../../lib/tms/access';
import { getI18n } from '../../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../../lib/tms/db';
import { fmtDate, fmtDateTime, formatINR, formatNumber, pick } from '../../../../../../lib/tms/format';
import { addRegistration, deleteEventMedia, saveEvent, updateRegistration } from '../../../../../../lib/tms/actions/events';
import { sendEventMessage } from '../../../../../../lib/tms/actions/community';
import { isEmailConfigured } from '../../../../../../lib/email';
import { isWhatsAppConfigured, whatsAppLink } from '../../../../../../lib/whatsapp';
import { TextAreaField } from '../../../../../../components/tms/ui';
import { hasOtpGrant } from '../../../../../../lib/tms/auth';

export const dynamic = 'force-dynamic';

const PAY_TONE = { paid: 'ok', pending: 'warn', waived: 'neutral', not_required: 'neutral' };
const REG_TONE = { registered: 'ok', attended: 'info', cancelled: 'error' };

/**
 * Everything about an event that members see: its details, whether it is on
 * the website, its banner and photographs, and who has registered.
 */
export default async function ManageEventPage({ params, searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  if (!isUuid(params.id)) notFound();
  const event = await one('select * from events where id = $1 and deleted_at is null', [params.id]);
  if (!event) notFound();

  const mayEdit = can(admin, 'enterMoney') && canChange(admin, 'events');
  const [media, regs] = await Promise.all([
    q('select id, kind, caption, size_bytes, created_at from event_media where event_id = $1 order by (kind = \'banner\') desc, sort_order, created_at', [params.id]),
    q(`select r.*, p.code as person_code from event_registrations r left join people p on p.id = r.person_id
        where r.event_id = $1 order by (r.status = 'cancelled'), r.created_at`, [params.id]),
  ]);
  const live = regs.filter((r) => r.status !== 'cancelled');
  const [messages, granted] = await Promise.all([
    q('select m.channel, m.subject, m.body, m.sent, m.failed, m.created_at, u.name as by from event_messages m left join admin_users u on u.id = m.created_by where m.event_id = $1 order by m.created_at desc limit 10', [params.id]),
    hasOtpGrant(admin),
  ]);
  const mayMessage = can(admin, 'review') && canChange(admin, 'events');
  const waReady = isWhatsAppConfigured();
  const reminder = `${event.name_en}${event.event_date ? `, ${fmtDate(event.event_date)}` : ''}${event.starts_at_text ? `, ${event.starts_at_text}` : ''}${event.venue ? `, ${event.venue}` : ''}${event.map_url ? `. Map: ${event.map_url}` : ''}. Pune CKP Family Public Trust.`;
  const heads = live.reduce((sum, r) => sum + 1 + Number(r.guests || 0), 0);
  const due = live.reduce((sum, r) => sum + Number(r.amount_due || 0), 0);
  const paid = live.filter((r) => r.payment_status === 'paid').reduce((sum, r) => sum + Number(r.amount_due || 0), 0);
  const banner = media.find((m) => m.kind === 'banner');
  const photos = media.filter((m) => m.kind === 'photo');
  const name = pick(lang, event.name_mr, event.name_en);
  const src = (m) => `/api/tms/events/${event.id}/media?m=${m.id}`;
  const exportBase = `/api/tms/events/${event.id}/registrations`;

  return (
    <>
      <PageHead
        title={name}
        intro={[event.event_date ? fmtDate(event.event_date) : null, event.starts_at_text, event.venue, event.code].filter(Boolean).join(' · ')}
        crumbs={[{ href: '/events', label: t('evt.title') }, { label: event.code }]}
      >
        <Link href={`/events/${event.id}`} className="tms-btn tms-btn--secondary"><Icon name="report" />{t('x.ev.accounts')}</Link>
        <Link href={`/planner/new?event=${event.id}`} className="tms-btn tms-btn--secondary"><Icon name="scheme" />{t('x.pl.title')}</Link>
      </PageHead>
      <Flash searchParams={searchParams} />
      {searchParams?.ok === 'message_sent' && (
        <div style={{ marginBottom: '1rem' }}><Alert tone={Number(searchParams.failed) > 0 ? 'warn' : 'ok'}>{t('x.msg.result', { sent: Number(searchParams.sent) || 0, failed: Number(searchParams.failed) || 0 })}</Alert></div>
      )}

      <div className="tms-stack">
        <p>
          <Badge tone={event.is_published ? 'ok' : 'neutral'}>{event.is_published ? t('x.ev.on_site') : t('x.ev.not_on_site')}</Badge>{' '}
          <Badge tone={event.registration_open ? 'ok' : 'neutral'}>{event.registration_open ? t('x.ev.reg_is_open') : t('x.ev.reg_is_closed')}</Badge>{' '}
          <Badge tone="info">{event.members_only ? t('x.ev.members_only') : t('x.ev.open_to_all')}</Badge>
        </p>
        {!event.is_published && <Alert tone="info">{t('x.ev.not_published_note')}</Alert>}

        <div className="tms-grid tms-grid--4">
          <Stat label={t('x.ev.registrations')} value={formatNumber(live.length)} note={regs.length !== live.length ? t('x.ev.cancelled_n', { n: regs.length - live.length }) : undefined} />
          <Stat label={t('x.ev.people_expected')} value={formatNumber(heads)} note={event.capacity ? t('x.ev.of_capacity', { n: formatNumber(event.capacity) }) : t('x.ev.no_limit')} />
          <Stat label={t('x.ev.fees_due')} value={formatINR(due)} note={Number(event.fee) > 0 ? t('x.ev.fee_each', { fee: formatINR(event.fee) }) : t('x.ev.free')} />
          <Stat label={t('x.ev.fees_paid')} value={formatINR(paid)} />
        </div>

        <Card title={`${t('x.ev.registrations')} (${live.length})`}>
          <div className="tms-actions no-print" style={{ marginBottom: '1rem' }}>
            <a className="tms-btn" href={exportBase} target="_blank" rel="noopener"><Icon name="print" />{t('x.ev.list_pdf')}</a>
            {can(admin, 'export') && <a className="tms-btn tms-btn--secondary" href={`${exportBase}?format=xlsx`}><Icon name="download" />{t('x.ev.list_excel')}</a>}
          </div>
          {regs.length === 0 ? <Empty title={t('x.ev.no_regs')} hint={t('x.ev.no_regs_hint')} /> : (
            <DataTable
              rows={regs}
              columns={[
                { label: t('f.name'), lead: true, cell: (r) => (r.person_id ? <Link href={`/people/${r.person_id}`}>{r.name}</Link> : r.name) },
                { label: t('x.ev.reg_id'), cell: (r) => <span className="mono">{r.code}</span> },
                { label: t('f.phone'), cell: (r) => (r.phone ? (whatsAppLink(r.phone, reminder) ? <>{r.phone} <a href={whatsAppLink(r.phone, reminder)} target="_blank" rel="noopener noreferrer" className="no-print">{t('x.msg.wa_one')}</a></> : r.phone) : '—') },
                { label: t('x.ev.guests'), right: true, cell: (r) => formatNumber(r.guests) },
                { label: t('x.ev.fee_col'), right: true, cell: (r) => (Number(r.amount_due) > 0 ? formatINR(r.amount_due) : '—') },
                { label: t('c.status'), cell: (r) => (
                  <>
                    <Badge tone={REG_TONE[r.status]}>{t(`x.ev.st.${r.status}`)}</Badge>{' '}
                    {Number(r.amount_due) > 0 && <Badge tone={PAY_TONE[r.payment_status]}>{t(`x.ev.pay.${r.payment_status}`)}</Badge>}
                  </>
                ) },
                { label: t('x.ev.registered_on'), cell: (r) => `${fmtDateTime(r.created_at)} · ${r.source === 'admin' ? t('x.ev.by_office') : t('x.ev.by_member')}` },
                ...(mayEdit ? [{ label: t('x.ev.change'), cell: (r) => (
                  <form action={updateRegistration} className="tms-actions no-print">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="event_id" value={event.id} />
                    {r.status !== 'attended' && r.status !== 'cancelled' && <button className="tms-btn tms-btn--small tms-btn--secondary" name="status" value="attended">{t('x.ev.mark_attended')}</button>}
                    {Number(r.amount_due) > 0 && r.payment_status === 'pending' && <button className="tms-btn tms-btn--small tms-btn--secondary" name="payment_status" value="paid">{t('x.ev.mark_paid')}</button>}
                    {r.status !== 'cancelled'
                      ? <button className="tms-btn tms-btn--small tms-btn--quiet" name="status" value="cancelled">{t('x.ev.cancel')}</button>
                      : <button className="tms-btn tms-btn--small tms-btn--quiet" name="status" value="registered">{t('x.ev.restore')}</button>}
                  </form>
                ) }] : []),
              ]}
            />
          )}
          {mayEdit && (
            <details className="no-print" style={{ marginTop: '1rem' }}>
              <summary>{t('x.ev.add_reg')}</summary>
              <form action={addRegistration} style={{ marginTop: '0.75rem', maxWidth: '40rem' }}>
                <input type="hidden" name="event_id" value={event.id} />
                <TextField label={t('f.name')} name="name" required minLength={2} maxLength={120} />
                <div className="tms-grid tms-grid--2">
                  <TextField label={t('f.phone')} name="phone" type="tel" optional={t('c.optional')} maxLength={20} />
                  <TextField label={t('x.ev.guests')} name="guests" inputMode="numeric" optional={t('c.optional')} defaultValue="0" hint={t('x.ev.guests_hint')} />
                </div>
                <TextField label={t('f.notes')} name="notes" optional={t('c.optional')} maxLength={300} />
                <SubmitButton>{t('x.ev.add_reg')}</SubmitButton>
              </form>
            </details>
          )}
        </Card>

        {mayMessage && (
          <Card title={t('x.msg.title')}>
            <p className="muted" style={{ marginBottom: '0.75rem' }}>{t('x.msg.intro', { n: live.length })}</p>
            {!granted && <p className="tms-hint" style={{ marginBottom: '0.75rem' }}>{t('usr.needs_code')} <a href={`/verify?next=${encodeURIComponent(`/events/${event.id}/manage`)}`}>{t('otp.get_now')}</a></p>}
            <form action={sendEventMessage} className="no-print" style={{ maxWidth: '46rem' }}>
              <input type="hidden" name="event_id" value={event.id} />
              <fieldset className="tms-field" style={{ border: 0, padding: 0 }}>
                <legend className="tms-label">{t('x.msg.channel')}</legend>
                <div className="tms-choices">
                  <label className="tms-choice"><input type="radio" name="channel" value="email" defaultChecked /><span>{t('x.msg.email')}</span></label>
                  <label className="tms-choice"><input type="radio" name="channel" value="whatsapp" disabled={!waReady} /><span>{t('x.msg.whatsapp')}</span></label>
                </div>
              </fieldset>
              {!waReady && <p className="tms-hint" style={{ marginBottom: '0.75rem' }}>{t('x.msg.wa_off')}</p>}
              {!isEmailConfigured() && <p className="tms-error" style={{ marginBottom: '0.75rem' }}>{t('x.pt.no_mail')}</p>}
              <TextField label={t('x.msg.subject')} name="subject" maxLength={150} placeholder={t('x.msg.subject_ph')} hint={t('x.msg.subject_hint')} />
              <TextAreaField label={t('x.msg.body')} name="body" required minLength={5} maxLength={1500} rows={4} hint={t('x.msg.body_hint')} />
              <ConfirmSubmit label={t('x.msg.send', { n: live.length })} icon="mail" className="tms-btn" message={t('x.msg.confirm', { n: live.length })} />
            </form>
            {messages.length > 0 && (
              <>
                <h3 style={{ margin: '1.25rem 0 0.5rem' }}>{t('x.msg.history')}</h3>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {messages.map((m, i) => (
                    <li key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--line)' }}>
                      <Badge tone="info">{t(`x.msg.${m.channel}`)}</Badge> <strong>{m.subject || String(m.body).slice(0, 60)}</strong>
                      <br /><span className="muted">{fmtDateTime(m.created_at)} · {m.by} · {t('x.msg.result', { sent: m.sent, failed: m.failed })}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}

        <div className="tms-grid tms-grid--2">
          <Card title={t('x.md.banner')}>
            {banner ? (
              <figure style={{ margin: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(banner)} alt="" style={{ width: '100%', borderRadius: 12, border: '2px solid var(--line)' }} />
                {mayEdit && (
                  <form action={deleteEventMedia} className="no-print" style={{ marginTop: '0.75rem' }}>
                    <input type="hidden" name="id" value={banner.id} />
                    <input type="hidden" name="event_id" value={event.id} />
                    <ConfirmSubmit label={t('x.md.remove_banner')} message={t('x.md.confirm_remove')} className="tms-btn tms-btn--quiet tms-btn--small" />
                  </form>
                )}
              </figure>
            ) : <p className="muted" style={{ marginBottom: '0.75rem' }}>{t('x.md.no_banner')}</p>}
            {mayEdit && <div style={{ marginTop: '1rem' }}><MediaUploader eventId={event.id} kind="banner" /></div>}
          </Card>

          <Card title={`${t('x.md.photos')} (${photos.length})`}>
            {photos.length === 0 ? <p className="muted" style={{ marginBottom: '0.75rem' }}>{t('x.md.no_photos')}</p> : (
              <ul className="tms-photos">
                {photos.map((m) => (
                  <li key={m.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src(m)} alt={m.caption || ''} loading="lazy" />
                    {m.caption && <span className="cap">{m.caption}</span>}
                    {mayEdit && (
                      <form action={deleteEventMedia} className="no-print">
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="event_id" value={event.id} />
                        <ConfirmSubmit label={t('x.md.remove')} message={t('x.md.confirm_remove')} className="tms-btn tms-btn--quiet tms-btn--small" />
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {mayEdit && <div style={{ marginTop: '1rem' }}><MediaUploader eventId={event.id} kind="photo" /></div>}
            <p className="tms-hint">{t('x.md.live_note')}</p>
          </Card>
        </div>

        {mayEdit && (
          <Card title={t('x.ev.details')}>
            <EventForm t={t} action={saveEvent} event={event} />
          </Card>
        )}
      </div>
    </>
  );
}
