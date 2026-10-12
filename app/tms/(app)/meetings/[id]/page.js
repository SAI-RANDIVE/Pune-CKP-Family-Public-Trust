import { notFound } from 'next/navigation';
import Icon from '../../../../../components/tms/icons';
import { Flash, PageHead } from '../../../../../components/tms/blocks';
import { Badge, Card, KeyValues, SelectField, TextAreaField, TextField } from '../../../../../components/tms/ui';
import { ConfirmSubmit, PrintButton, SubmitButton } from '../../../../../components/tms/client';
import { requireRole, can } from '../../../../../lib/tms/auth';
import { canChange } from '../../../../../lib/tms/access';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../lib/tms/db';
import { fmtDate, isoDate, todayIso } from '../../../../../lib/tms/format';
import { addMeetingAction, deleteMeeting, saveMeeting, toggleMeetingAction } from '../../../../../lib/tms/actions/community';

export const dynamic = 'force-dynamic';

const KINDS = ['trustees', 'committee', 'agm', 'general', 'other'];
const pre = { whiteSpace: 'pre-wrap', lineHeight: 1.7 };

/** One meeting: its record, the tasks it gave out, and the form to write or correct the minutes. /meetings/new starts a new one. */
export default async function MeetingPage({ params, searchParams }) {
  const isNew = params.id === 'new';
  const admin = await requireRole(isNew ? 'accountant' : 'viewer');
  const { t } = await getI18n();
  const mayEdit = can(admin, 'enterMoney') && canChange(admin, 'meetings');

  let m = null;
  let actions = [];
  if (!isNew) {
    if (!isUuid(params.id)) notFound();
    m = await one(
      `select m.*, u.name as written_by from meetings m left join admin_users u on u.id = m.created_by where m.id = $1 and m.deleted_at is null`, [params.id]);
    if (!m) notFound();
    actions = await q('select * from meeting_actions where meeting_id = $1 order by done, sort_order', [params.id]);
  }
  const e = m || {};
  const editing = isNew || searchParams?.edit === '1';

  return (
    <>
      <PageHead
        title={isNew ? t('x.mt.add') : m.title}
        intro={isNew ? t('x.mt.add_intro') : `${t(`x.mt.k.${m.kind}`)} · ${fmtDate(m.held_on)}${m.time_text ? `, ${m.time_text}` : ''} · ${m.code}`}
        crumbs={[{ href: '/meetings', label: t('x.mt.title') }, { label: isNew ? t('x.mt.add') : m.code }]}
      >
        {!isNew && !editing && mayEdit && <a href={`/meetings/${m.id}?edit=1`} className="tms-btn">{t('c.edit')}</a>}
        {!isNew && <a href={`/api/tms/meetings/${m.id}`} target="_blank" rel="noopener" className="tms-btn tms-btn--secondary"><Icon name="download" />{t('x.mt.pdf')}</a>}
        {!isNew && <PrintButton label={t('c.print')} />}
      </PageHead>
      <Flash searchParams={searchParams} />

      <div className="tms-stack">
        {!isNew && !editing && (
          <>
            <Card title={t('x.mt.record')}>
              <KeyValues items={[
                [t('x.ev.venue'), m.venue],
                [t('x.mt.chaired'), m.chaired_by],
                [t('x.mt.attendees'), m.attendees ? <span key="a" style={pre}>{m.attendees}</span> : ''],
                [t('x.mt.next'), m.next_meeting_on ? fmtDate(m.next_meeting_on) : ''],
                [t('x.mt.written_by'), m.written_by],
              ]} />
            </Card>
            {m.agenda && <Card title={t('x.mt.agenda')}><p style={pre}>{m.agenda}</p></Card>}
            {m.minutes && <Card title={t('x.mt.minutes')}><p style={pre}>{m.minutes}</p></Card>}
            {m.decisions && <Card title={t('x.mt.decisions')}><p style={pre}>{m.decisions}</p></Card>}
            {!m.minutes && !m.decisions && <p className="muted">{t('x.mt.no_minutes')}</p>}

            <Card title={`${t('x.mt.actions')} (${actions.length})`}>
              {actions.length === 0 ? <p className="muted">{t('x.mt.no_actions')}</p> : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {actions.map((a) => (
                    <li key={a.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--line)', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ textDecoration: a.done ? 'line-through' : 'none', opacity: a.done ? 0.7 : 1 }}>
                        <strong>{a.task}</strong>{a.owner ? ` · ${a.owner}` : ''}{' '}
                        {a.done ? <Badge tone="ok">{t('x.mt.done')}</Badge> : a.due_on && <Badge tone={isoDate(a.due_on) < todayIso() ? 'error' : 'warn'}>{t('x.mt.due', { date: fmtDate(a.due_on) })}</Badge>}
                      </span>
                      {mayEdit && (
                        <form action={toggleMeetingAction} className="tms-actions no-print">
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="meeting_id" value={m.id} />
                          <button type="submit" className="tms-btn tms-btn--small tms-btn--secondary">{a.done ? t('x.mt.reopen') : t('x.mt.mark_done')}</button>
                          <button type="submit" name="remove" value="1" className="tms-btn tms-btn--small tms-btn--quiet">{t('x.md.remove')}</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {mayEdit && (
                <form action={addMeetingAction} className="no-print" style={{ marginTop: '1rem' }}>
                  <input type="hidden" name="meeting_id" value={m.id} />
                  <div className="tms-grid tms-grid--3">
                    <TextField label={t('x.mt.task')} name="task" required minLength={2} maxLength={300} placeholder={t('x.mt.task_ph')} />
                    <TextField label={t('x.mt.owner')} name="owner" optional={t('c.optional')} maxLength={120} />
                    <TextField label={t('x.mt.due_on')} name="due_on" type="date" optional={t('c.optional')} />
                  </div>
                  <SubmitButton className="tms-btn tms-btn--secondary">{t('x.mt.add_task')}</SubmitButton>
                </form>
              )}
            </Card>

            {can(admin, 'review') && mayEdit && (
              <form action={deleteMeeting} className="no-print">
                <input type="hidden" name="id" value={m.id} />
                <ConfirmSubmit label={t('x.mt.delete')} message={t('x.mt.confirm_delete')} className="tms-btn tms-btn--quiet" />
              </form>
            )}
          </>
        )}

        {editing && mayEdit && (
          <Card style={{ maxWidth: '60rem' }}>
            <form action={saveMeeting}>
              {m && <input type="hidden" name="id" value={m.id} />}
              <div className="tms-grid tms-grid--2">
                <TextField label={t('x.mt.title_field')} name="title" required minLength={2} maxLength={200} defaultValue={e.title || ''} placeholder={t('x.mt.title_ph')} />
                <SelectField label={t('x.mt.kind')} name="kind" required defaultValue={e.kind || 'trustees'} options={KINDS.map((k) => ({ value: k, label: t(`x.mt.k.${k}`) }))} />
                <TextField label={t('x.mt.held_on')} name="held_on" type="date" required defaultValue={isoDate(e.held_on) || todayIso()} />
                <TextField label={t('x.ev.time')} name="time_text" optional={t('c.optional')} maxLength={40} defaultValue={e.time_text || ''} placeholder="6:00 pm" />
                <TextField label={t('x.ev.venue')} name="venue" optional={t('c.optional')} maxLength={200} defaultValue={e.venue || ''} />
                <TextField label={t('x.mt.chaired')} name="chaired_by" optional={t('c.optional')} maxLength={120} defaultValue={e.chaired_by || ''} />
              </div>
              <TextAreaField label={t('x.mt.attendees')} name="attendees" optional={t('c.optional')} maxLength={3000} rows={3} defaultValue={e.attendees || ''} hint={t('x.mt.attendees_hint')} />
              <TextAreaField label={t('x.mt.agenda')} name="agenda" optional={t('c.optional')} maxLength={6000} rows={4} defaultValue={e.agenda || ''} />
              <TextAreaField label={t('x.mt.minutes')} name="minutes" optional={t('c.optional')} maxLength={20000} rows={10} defaultValue={e.minutes || ''} hint={t('x.mt.minutes_hint')} />
              <TextAreaField label={t('x.mt.decisions')} name="decisions" optional={t('c.optional')} maxLength={8000} rows={5} defaultValue={e.decisions || ''} hint={t('x.mt.decisions_hint')} />
              <TextField label={t('x.mt.next')} name="next_meeting_on" type="date" optional={t('c.optional')} defaultValue={isoDate(e.next_meeting_on) || ''} />
              <div className="tms-actions">
                <SubmitButton className="tms-btn tms-btn--big">{isNew ? t('x.mt.save_new') : t('c.save_changes')}</SubmitButton>
                <a href={isNew ? '/meetings' : `/meetings/${m.id}`} className="tms-btn tms-btn--quiet">{t('c.cancel')}</a>
              </div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
