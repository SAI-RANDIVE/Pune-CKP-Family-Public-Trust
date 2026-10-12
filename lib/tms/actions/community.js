'use server';

import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { writeAudit } from '../../adminAuth';
import { issueCode } from '../../ids';
import { getPool } from '../../db';
import { describeMailError, isEmailConfigured, sendNoticeEmail } from '../../email';
import { isWhatsAppConfigured, sendWhatsApp } from '../../whatsapp';
import { RELATIONS } from '../../family';
import { tx, isUuid, one, q } from '../db';
import { audit, clientIp } from '../auth';
import { guardForm, refreshAll, tryForm, withParam } from '../actionKit';
import { check, date, optDate, optText, text } from '../schemas';
import { fmtDate, fyOf } from '../format';
import { bumpLive } from '../live';

/**
 * The trustees' desk beyond the books: the meetings register, polls,
 * suggestions and feedback, family groups, and messages to the people who
 * registered for an event.
 */

/* ---------------------------------------------------------------- meetings */

const MEETING_KINDS = ['trustees', 'committee', 'agm', 'general', 'other'];
const meetingSchema = z.object({
  kind: z.enum(MEETING_KINDS, { required_error: 'required', invalid_type_error: 'required' }),
  title: text(200, 2),
  held_on: date({ future: 366 }),
  time_text: optText(40),
  venue: optText(200),
  chaired_by: optText(120),
  attendees: optText(3000),
  agenda: optText(6000),
  minutes: optText(20000),
  decisions: optText(8000),
  next_meeting_on: optDate({ future: null }),
});

export async function saveMeeting(formData) {
  const id = String(formData.get('id') || '');
  const back = id && isUuid(id) ? `/meetings/${id}` : '/meetings/new';
  const admin = await guardForm('accountant', { back });
  const parsed = check(meetingSchema, Object.fromEntries([...meetingSchema.keyof().options].map((k) => [k, formData.get(k)])));
  if (!parsed.ok) redirect(withParam(back, 'err', Object.values(parsed.errors)[0]));
  const v = parsed.data;
  const fy = fyOf(v.held_on);

  const savedId = await tryForm(back, 'saveMeeting', () => tx(async (client) => {
    const values = [v.kind, v.title, v.held_on, fy, v.time_text, v.venue, v.chaired_by, v.attendees, v.agenda, v.minutes, v.decisions, v.next_meeting_on];
    if (id) {
      if (!isUuid(id)) throw new Error('NOT_FOUND');
      const res = await client.query(
        `update meetings set kind = $2, title = $3, held_on = $4, fy = $5, time_text = $6, venue = $7, chaired_by = $8, attendees = $9,
                agenda = $10, minutes = $11, decisions = $12, next_meeting_on = $13, updated_at = now()
          where id = $1 and deleted_at is null`, [id, ...values]);
      if (!res.rowCount) throw new Error('NOT_FOUND');
      await writeAudit({ client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(), action: 'meeting_updated', entity: 'meetings', entityId: id, detail: { title: v.title } });
      return id;
    }
    const newId = crypto.randomUUID();
    const code = await issueCode(client, 'meetings', { id: newId, fy });
    await client.query(
      `insert into meetings (id, code, kind, title, held_on, fy, time_text, venue, chaired_by, attendees, agenda, minutes, decisions, next_meeting_on, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [newId, code, ...values, admin.id]);
    await writeAudit({ client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(), action: 'meeting_created', entity: 'meetings', entityId: newId, detail: { code, title: v.title } });
    return newId;
  }));
  redirect(`/meetings/${savedId}?ok=saved`);
}

export async function deleteMeeting(formData) {
  const id = String(formData.get('id') || '');
  const admin = await guardForm('admin', { back: '/meetings' });
  if (!isUuid(id)) redirect('/meetings?err=not_found');
  await tryForm('/meetings', 'deleteMeeting', async () => {
    const row = await one('update meetings set deleted_at = now() where id = $1 and deleted_at is null returning code, title', [id]);
    if (!row) throw new Error('NOT_FOUND');
    await audit(admin, { action: 'meeting_deleted', entity: 'meetings', entityId: id, detail: row });
  });
  redirect('/meetings?ok=removed');
}

export async function addMeetingAction(formData) {
  const meetingId = String(formData.get('meeting_id') || '');
  const back = isUuid(meetingId) ? `/meetings/${meetingId}` : '/meetings';
  await guardForm('accountant', { back });
  const task = String(formData.get('task') || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
  const owner = String(formData.get('owner') || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) || null;
  const due = String(formData.get('due_on') || '');
  if (!isUuid(meetingId) || task.length < 2) redirect(withParam(back, 'err', 'required'));
  await tryForm(back, 'addMeetingAction', () => q(
    `insert into meeting_actions (meeting_id, task, owner, due_on, sort_order)
     select $1, $2, $3, $4::date, coalesce(max(sort_order), 0) + 1 from meeting_actions where meeting_id = $1`,
    [meetingId, task, owner, /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null]));
  redirect(withParam(back, 'ok', 'saved'));
}

export async function toggleMeetingAction(formData) {
  const id = String(formData.get('id') || '');
  const meetingId = String(formData.get('meeting_id') || '');
  const back = isUuid(meetingId) ? `/meetings/${meetingId}` : '/meetings';
  await guardForm('accountant', { back });
  if (!isUuid(id)) redirect(withParam(back, 'err', 'not_found'));
  const remove = formData.get('remove') === '1';
  await tryForm(back, 'toggleMeetingAction', () => (remove
    ? q('delete from meeting_actions where id = $1', [id])
    : q('update meeting_actions set done = not done, done_at = case when done then null else now() end where id = $1', [id])));
  redirect(withParam(back, 'ok', 'updated'));
}

/* ------------------------------------------------------------------- polls */

export async function savePoll(formData) {
  const admin = await guardForm('admin', { back: '/polls' });
  const question = String(formData.get('question') || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
  const description = String(formData.get('description') || '').trim().slice(0, 1500) || null;
  const options = String(formData.get('options') || '').split(/\r?\n/).map((o) => o.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 160)).filter(Boolean);
  const closes = String(formData.get('closes_at') || '');
  const showResults = ['always', 'after_vote', 'after_close'].includes(String(formData.get('show_results'))) ? String(formData.get('show_results')) : 'after_vote';
  const publish = formData.get('is_published') === 'on';
  // The trustee types a local (India) date and time; it is stored as an exact moment.
  const closesAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(closes) ? new Date(`${closes}:00+05:30`) : null;
  if (question.length < 5) redirect('/polls?err=required');
  if (options.length < 2 || options.length > 10 || new Set(options.map((o) => o.toLowerCase())).size !== options.length) redirect('/polls?err=poll_options');
  if (!closesAt || Number.isNaN(closesAt.getTime()) || closesAt.getTime() < Date.now() + 5 * 60000) redirect('/polls?err=poll_time');

  await tryForm('/polls', 'savePoll', () => tx(async (client) => {
    const id = crypto.randomUUID();
    const code = await issueCode(client, 'polls', { id, date: new Date() });
    await client.query(
      'insert into polls (id, code, question, description, options, closes_at, is_published, show_results, created_by) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)',
      [id, code, question, description, JSON.stringify(options), closesAt, publish, showResults, admin.id]);
    await writeAudit({ client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(), action: 'poll_created', entity: 'polls', entityId: id, detail: { code, question, options: options.length } });
  }));
  await bumpLive('polls');
  redirect('/polls?ok=saved');
}

/** Publish / hide, close now, or remove a poll. Votes already cast are kept with a closed poll. */
export async function updatePoll(formData) {
  const admin = await guardForm('admin', { back: '/polls' });
  const id = String(formData.get('id') || '');
  const what = String(formData.get('what') || '');
  if (!isUuid(id) || !['publish', 'hide', 'close', 'delete'].includes(what)) redirect('/polls?err=required');
  await tryForm('/polls', 'updatePoll', async () => {
    const sql = {
      publish: 'update polls set is_published = true, updated_at = now() where id = $1 and deleted_at is null returning code',
      hide: 'update polls set is_published = false, updated_at = now() where id = $1 and deleted_at is null returning code',
      close: 'update polls set closes_at = least(closes_at, now()), updated_at = now() where id = $1 and deleted_at is null returning code',
      delete: 'update polls set deleted_at = now(), is_published = false where id = $1 and deleted_at is null returning code',
    }[what];
    const row = await one(sql, [id]);
    if (!row) throw new Error('NOT_FOUND');
    await audit(admin, { action: `poll_${what}`, entity: 'polls', entityId: id, detail: row });
  });
  await bumpLive('polls');
  redirect(`/polls?ok=${what === 'delete' ? 'removed' : 'updated'}`);
}

/* ---------------------------------------------------------------- feedback */

const FEEDBACK_STATUS = ['new', 'noted', 'in_progress', 'done'];

/** Notes what was done about a message and, when a reply is typed and an e-mail address is known, sends it. */
export async function updateFeedback(formData) {
  const admin = await guardForm('admin', { back: '/feedback' });
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  const reply = String(formData.get('reply') || '').trim().slice(0, 3000) || null;
  if (!isUuid(id) || !FEEDBACK_STATUS.includes(status)) redirect('/feedback?err=required');

  const row = await one(
    `select f.*, p.email as person_email, coalesce(p.name_en, p.name_mr) as person_name from feedback f left join people p on p.id = f.person_id where f.id = $1`, [id]);
  if (!row) redirect('/feedback?err=not_found');
  const newReply = reply && reply !== row.reply;
  await tryForm('/feedback', 'updateFeedback', () => q(
    `update feedback set status = $2, reply = coalesce($3, reply),
            replied_by = case when $4 then $5 else replied_by end, replied_at = case when $4 then now() else replied_at end
      where id = $1`, [id, status, reply, Boolean(newReply), admin.id]));

  let mailed = false;
  const to = row.person_email || (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(row.contact || '')) ? row.contact : null);
  if (newReply && to && isEmailConfigured()) {
    try {
      await sendNoticeEmail({
        to,
        subject: `Reply from Pune CKP Family Public Trust (${row.code})`,
        heading: 'A reply from the trustees',
        greeting: `Namaskar ${row.person_name || row.name || ''},`,
        paragraphs: ['Thank you for writing to the trust. Here is the trustees\' reply:', reply],
        facts: [['Your message', String(row.message).slice(0, 400)], ['Reference', row.code, { mono: true }]],
      });
      mailed = true;
    } catch (err) {
      console.error('[TMS] feedback reply e-mail failed:', describeMailError(err));
    }
  }
  await audit(admin, { action: 'feedback_updated', entity: 'feedback', entityId: id, detail: { code: row.code, status, replied: Boolean(newReply), mailed } });
  refreshAll();
  redirect(`/feedback?ok=${mailed ? 'reply_sent' : 'updated'}`);
}

/* ------------------------------------------------------------------ family */

/** A trustee links two people as family at the trust desk (no code needed: the trustee is the witness). */
export async function linkFamily(formData) {
  const personId = String(formData.get('person_id') || '');
  const back = isUuid(personId) ? `/people/${personId}` : '/people';
  const admin = await guardForm('accountant', { back });
  const relativeText = String(formData.get('relative') || '').trim().slice(0, 40);
  const relation = String(formData.get('relation') || '');
  if (!isUuid(personId) || !RELATIONS.includes(relation) || relativeText.length < 3) redirect(withParam(back, 'err', 'required'));

  const relative = await one(
    `select p.id from people p
      where p.deleted_at is null and p.merged_into_id is null
        and (upper(replace(p.code, ' ', '')) = upper(replace($1, ' ', ''))
          or exists (select 1 from memberships m where m.person_id = p.id and upper(replace(m.code, ' ', '')) = upper(replace($1, ' ', '')))
          or exists (select 1 from membership_numbers n join memberships m on m.id = n.membership_id
                      where m.person_id = p.id and upper(replace(n.number_as_written, ' ', '')) = upper(replace($1, ' ', ''))))
      limit 1`, [relativeText]);
  if (!relative) redirect(withParam(back, 'err', 'not_found'));
  if (relative.id === personId) redirect(withParam(back, 'err', 'family_self'));

  await tryForm(back, 'linkFamily', () => tx(async (client) => {
    await client.query(
      `insert into family_links (person_id, relative_id, relation, status, confirmed_by, confirmed_at, created_by_admin)
       values ($1,$2,$3,'confirmed','trust', now(), $4)
       on conflict (least(person_id, relative_id), greatest(person_id, relative_id))
       do update set person_id = excluded.person_id, relative_id = excluded.relative_id, relation = excluded.relation,
                     status = 'confirmed', confirmed_by = 'trust', confirmed_at = now(), code_hash = null, created_by_admin = excluded.created_by_admin`,
      [personId, relative.id, relation, admin.id]);
    await writeAudit({ client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(), action: 'family_linked', entity: 'people', entityId: personId, detail: { relative: relative.id, relation } });
  }));
  redirect(withParam(back, 'ok', 'saved'));
}

export async function unlinkFamily(formData) {
  const personId = String(formData.get('person_id') || '');
  const linkId = String(formData.get('link_id') || '');
  const back = isUuid(personId) ? `/people/${personId}` : '/people';
  const admin = await guardForm('accountant', { back });
  if (!isUuid(linkId)) redirect(withParam(back, 'err', 'not_found'));
  await tryForm(back, 'unlinkFamily', async () => {
    const row = await one('delete from family_links where id = $1 and (person_id = $2 or relative_id = $2) returning person_id, relative_id, relation', [linkId, personId]);
    if (!row) throw new Error('NOT_FOUND');
    await audit(admin, { action: 'family_unlinked', entity: 'people', entityId: personId, detail: row });
  });
  redirect(withParam(back, 'ok', 'removed'));
}

/* ---------------------------------------------------------- event messages */

const BATCH_LIMIT = 150;

/**
 * Sends a message to everyone registered for an event (cancelled ones left
 * out), by e-mail or by WhatsApp. Admin + e-mailed code, because it writes to
 * many people at once. The event's date, time, place and map link are added
 * automatically so the trustee only types the news.
 */
export async function sendEventMessage(formData) {
  const eventId = String(formData.get('event_id') || '');
  const back = isUuid(eventId) ? `/events/${eventId}/manage` : '/events';
  const admin = await guardForm('admin', { otp: true, back });
  const channel = formData.get('channel') === 'whatsapp' ? 'whatsapp' : 'email';
  const subject = String(formData.get('subject') || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 150);
  const body = String(formData.get('body') || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 1500);
  if (!isUuid(eventId) || body.length < 5 || (channel === 'email' && subject.length < 3)) redirect(withParam(back, 'err', 'required'));
  if (channel === 'email' && !isEmailConfigured()) redirect(withParam(back, 'err', 'mail'));
  if (channel === 'whatsapp' && !isWhatsAppConfigured()) redirect(withParam(back, 'err', 'whatsapp_off'));

  const event = await one('select id, code, name_en, event_date, starts_at_text, venue, map_url from events where id = $1 and deleted_at is null', [eventId]);
  if (!event) redirect(withParam(back, 'err', 'not_found'));
  const people = await q(
    `select r.name, coalesce(nullif(r.email, ''), p.email) as email, coalesce(nullif(r.phone, ''), p.phone) as phone
       from event_registrations r left join people p on p.id = r.person_id
      where r.event_id = $1 and r.status <> 'cancelled' order by r.created_at limit ${BATCH_LIMIT}`, [eventId]);
  const when = [event.event_date ? fmtDate(event.event_date) : null, event.starts_at_text].filter(Boolean).join(', ');

  let sent = 0;
  let failed = 0;
  const seen = new Set();
  for (const person of people) {
    const address = channel === 'email' ? String(person.email || '').toLowerCase() : String(person.phone || '').replace(/\D/g, '').slice(-10);
    if (!address || seen.has(address)) continue;
    seen.add(address);
    try {
      if (channel === 'email') {
        await sendNoticeEmail({
          to: person.email,
          subject: `${subject} | ${event.name_en}`,
          heading: subject,
          greeting: `Namaskar ${person.name || ''},`,
          paragraphs: body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
          facts: [['Event', event.name_en], ['When', when], ['Where', event.venue]],
          button: event.map_url ? { href: event.map_url, label: 'Open the place in Google Maps' } : undefined,
          closing: 'You are receiving this because you registered for this event with Pune CKP Family Public Trust.',
        });
      } else {
        const tail = [when && `on ${when}`, event.venue && `at ${event.venue}`, event.map_url && `Map: ${event.map_url}`].filter(Boolean).join(', ');
        await sendWhatsApp(person.phone, `${event.name_en}${tail ? ` (${tail})` : ''}: ${body}`);
      }
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`[TMS] event ${channel} failed:`, channel === 'email' ? describeMailError(err) : err?.message);
      if (failed >= 5 && sent === 0) break; // the service is refusing: stop instead of working through the whole list
    }
  }
  await getPool().query(
    'insert into event_messages (event_id, channel, subject, body, recipients, sent, failed, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [eventId, channel, subject || null, body, seen.size, sent, failed, admin.id]);
  await audit(admin, { action: 'event_message_sent', entity: 'events', entityId: eventId, detail: { channel, recipients: seen.size, sent, failed } });
  redirect(`${back}?ok=message_sent&sent=${sent}&failed=${failed}`);
}
