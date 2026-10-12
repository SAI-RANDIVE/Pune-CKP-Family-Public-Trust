'use server';

import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { writeAudit } from '../../adminAuth';
import { issueCode } from '../../ids';
import { tx, isUuid } from '../db';
import { clientIp } from '../auth';
import { guardForm, runAction, tryForm, withParam } from '../actionKit';
import { check, optDate, optText, text } from '../schemas';
import { fyOf } from '../format';
import { bumpLive } from '../live';
import { getPool } from '../../db';

/**
 * Events that members can see and register for, their banners and photos,
 * the registration list, and the budget planner. Entry roles and above; the
 * Chairman can limit the whole section per login (Settings > Users).
 */

const money = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? 0 : (typeof v === 'string' ? Number(v.replace(/[,\s₹]/g, '')) : v)),
  z.number({ invalid_type_error: 'amount' }).finite('amount').min(0, 'amount').max(100000000, 'amount_big'));
const count = (max) => z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number({ invalid_type_error: 'number' }).int('number').min(0, 'number').max(max, 'number').nullable());
const onOff = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());

const eventSchema = z.object({
  name_en: text(160, 2),
  name_mr: optText(160),
  event_date: optDate({ future: null }),
  starts_at_text: optText(40),
  venue: optText(200),
  description_en: optText(3000),
  description_mr: optText(3000),
  fee: money,
  capacity: count(100000),
  members_only: onOff,
  is_published: onOff,
  registration_open: onOff,
  registration_closes_on: optDate({ future: null }),
});

const slugify = (name) => String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'event';

function refreshPublic() {
  // The public pages that show events are rebuilt on the next visit.
  revalidatePath('/events');
  revalidatePath('/');
  revalidatePath('/member/events');
}

/** Adds an event, or changes one (when id is set). */
export async function saveEvent(formData) {
  const id = String(formData.get('id') || '');
  const back = id && isUuid(id) ? `/events/${id}/manage` : '/events/new';
  const admin = await guardForm('accountant', { back });
  const parsed = check(eventSchema, Object.fromEntries([...eventSchema.keyof().options].map((k) => [k, formData.get(k)])));
  if (!parsed.ok) redirect(withParam(back, 'err', Object.values(parsed.errors)[0]));
  const v = parsed.data;
  const fy = v.event_date ? fyOf(v.event_date) : null;

  const savedId = await tryForm(back, 'saveEvent', () => tx(async (client) => {
    if (id) {
      if (!isUuid(id)) throw new Error('NOT_FOUND');
      const { rows } = await client.query('select * from events where id = $1 and deleted_at is null for update', [id]);
      if (!rows.length) throw new Error('NOT_FOUND');
      const updated = await client.query(
        `update events set name_en = $2, name_mr = $3, event_date = $4, fy = coalesce($5, fy), starts_at_text = $6, venue = $7,
                description_en = $8, description_mr = $9, fee = $10, capacity = $11, members_only = $12, is_published = $13,
                registration_open = $14, registration_closes_on = $15, updated_at = now()
          where id = $1 returning *`,
        [id, v.name_en, v.name_mr, v.event_date, fy, v.starts_at_text, v.venue, v.description_en, v.description_mr, v.fee, v.capacity,
          v.members_only, v.is_published, v.registration_open, v.registration_closes_on]);
      await writeAudit({
        client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
        action: 'event_updated', entity: 'events', entityId: id, before: rows[0], after: updated.rows[0],
      });
      return id;
    }
    const newId = crypto.randomUUID();
    const code = await issueCode(client, 'events', { id: newId, fy });
    const base = slugify(`${v.name_en}${v.event_date ? `-${v.event_date.slice(0, 4)}` : ''}`);
    const { rows: taken } = await client.query('select count(*)::int as n from events where slug = $1 or slug like $2', [base, `${base}-%`]);
    const slug = taken[0].n ? `${base}-${taken[0].n + 1}` : base;
    const inserted = await client.query(
      `insert into events (id, code, slug, name_en, name_mr, event_date, fy, starts_at_text, venue, description_en, description_mr,
                           fee, capacity, members_only, is_published, registration_open, registration_closes_on, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning *`,
      [newId, code, slug, v.name_en, v.name_mr, v.event_date, fy, v.starts_at_text, v.venue, v.description_en, v.description_mr, v.fee,
        v.capacity, v.members_only, v.is_published, v.registration_open, v.registration_closes_on, admin.id]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'event_created', entity: 'events', entityId: newId, after: inserted.rows[0],
    });
    return newId;
  }));
  // The map link is kept only when it really is a Google Maps address, so the website never links anywhere else.
  const map = String(formData.get('map_url') || '').trim().slice(0, 500);
  const mapOk = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]{2,6}\/maps|maps\.google\.[a-z.]{2,6})(\/|\?|$)/i.test(map);
  await tryForm(`/events/${savedId}/manage`, 'saveEventMap', () => getPool().query('update events set map_url = $2 where id = $1', [savedId, mapOk ? map : null]));
  await bumpLive('events');
  refreshPublic();
  redirect(`/events/${savedId}/manage?ok=${map && !mapOk ? 'saved_no_map' : 'saved'}`);
}

/** Removes a banner or photograph. */
export async function deleteEventMedia(formData) {
  const id = String(formData.get('id') || '');
  const eventId = String(formData.get('event_id') || '');
  const back = isUuid(eventId) ? `/events/${eventId}/manage` : '/events';
  const admin = await guardForm('accountant', { back });
  if (!isUuid(id)) redirect(withParam(back, 'err', 'not_found'));
  await tryForm(back, 'deleteEventMedia', () => tx(async (client) => {
    const { rows } = await client.query('delete from event_media where id = $1 returning id, event_id, kind, caption, size_bytes', [id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'event_media_deleted', entity: 'events', entityId: rows[0].event_id, before: rows[0],
    });
  }));
  await bumpLive('events');
  refreshPublic();
  redirect(withParam(back, 'ok', 'removed'));
}

const registrationSchema = z.object({
  event_id: z.string().uuid('required'),
  person_id: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().uuid('invalid').nullable()),
  name: text(120, 2),
  phone: optText(20),
  email: optText(254),
  guests: z.preprocess((v) => (v === '' || v === null || v === undefined ? 0 : Number(v)), z.number().int('number').min(0, 'number').max(20, 'number')),
  notes: optText(300),
});

/** A trustee registers someone by hand (a phone call, a form on paper). */
export async function addRegistration(formData) {
  const eventId = String(formData.get('event_id') || '');
  const back = isUuid(eventId) ? `/events/${eventId}/manage` : '/events';
  const admin = await guardForm('accountant', { back });
  const parsed = check(registrationSchema, Object.fromEntries([...registrationSchema.keyof().options].map((k) => [k, formData.get(k)])));
  if (!parsed.ok) redirect(withParam(back, 'err', Object.values(parsed.errors)[0]));
  const v = parsed.data;
  await tryForm(back, 'addRegistration', () => tx(async (client) => {
    const { rows } = await client.query('select id, fy, fee from events where id = $1 and deleted_at is null', [v.event_id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    const event = rows[0];
    const id = crypto.randomUUID();
    const code = await issueCode(client, 'event_registrations', { id, fy: event.fy });
    const due = Number(event.fee) * (1 + v.guests);
    await client.query(
      `insert into event_registrations (id, code, event_id, person_id, name, phone, email, guests, amount_due, payment_status, notes, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'admin')`,
      [id, code, v.event_id, v.person_id, v.name, v.phone, v.email, v.guests, due, due > 0 ? 'pending' : 'not_required', v.notes]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'event_registration_added', entity: 'events', entityId: v.event_id, detail: { code, name: v.name, guests: v.guests },
    });
  }));
  await bumpLive('events');
  redirect(withParam(back, 'ok', 'saved'));
}

const REG_STATUS = ['registered', 'cancelled', 'attended'];
const PAY_STATUS = ['not_required', 'pending', 'paid', 'waived'];

/** Marks a registration cancelled / attended, or its fee as paid / waived. */
export async function updateRegistration(formData) {
  const id = String(formData.get('id') || '');
  const eventId = String(formData.get('event_id') || '');
  const back = isUuid(eventId) ? `/events/${eventId}/manage` : '/events';
  const admin = await guardForm('accountant', { back });
  const status = String(formData.get('status') || '');
  const payment = String(formData.get('payment_status') || '');
  if (!isUuid(id) || (status && !REG_STATUS.includes(status)) || (payment && !PAY_STATUS.includes(payment))) redirect(withParam(back, 'err', 'required'));
  await tryForm(back, 'updateRegistration', () => tx(async (client) => {
    const { rows } = await client.query('select * from event_registrations where id = $1 for update', [id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    const updated = await client.query(
      `update event_registrations set status = coalesce(nullif($2, ''), status), payment_status = coalesce(nullif($3, ''), payment_status), updated_at = now()
        where id = $1 returning *`, [id, status, payment]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'event_registration_updated', entity: 'events', entityId: rows[0].event_id,
      before: { status: rows[0].status, payment_status: rows[0].payment_status },
      after: { status: updated.rows[0].status, payment_status: updated.rows[0].payment_status }, detail: { code: rows[0].code },
    });
  }));
  await bumpLive('events');
  redirect(withParam(back, 'ok', 'updated'));
}

/* ------------------------------------------------------------------ planner */

const planSchema = z.object({
  title: text(160, 2),
  event_id: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().uuid('invalid').nullable()),
  expected_attendees: z.preprocess((v) => (v === '' || v === null || v === undefined ? 0 : Number(v)), z.number().int('number').min(0, 'number').max(100000, 'number')),
  entry_fee: money,
  notes: optText(1000),
  items: z.array(z.object({
    kind: z.enum(['income', 'expense']),
    label: text(160, 1),
    qty: z.preprocess((v) => (v === '' || v === null || v === undefined ? 1 : Number(v)), z.number().finite('number').min(0, 'number').max(1000000, 'number')),
    unit_amount: money,
    per_head: z.preprocess((v) => Boolean(v), z.boolean()),
  })).max(200, 'too_long'),
});

/** Saves a budget plan with all its lines (the planner screen sends the whole plan each time). */
export async function savePlan(input) {
  return runAction({
    minimum: 'accountant', schema: planSchema, input, label: 'savePlan',
    work: (admin, v) => tx(async (client) => {
      let id = input?.id && isUuid(input.id) ? input.id : null;
      if (id) {
        const res = await client.query(
          `update event_plans set title = $2, event_id = $3, expected_attendees = $4, entry_fee = $5, notes = $6, updated_at = now()
            where id = $1 and deleted_at is null`, [id, v.title, v.event_id, v.expected_attendees, v.entry_fee, v.notes]);
        if (!res.rowCount) throw new Error('NOT_FOUND');
        await client.query('delete from event_plan_items where plan_id = $1', [id]);
      } else {
        id = crypto.randomUUID();
        const code = await issueCode(client, 'event_plans', { id, date: new Date() });
        await client.query(
          `insert into event_plans (id, code, title, event_id, expected_attendees, entry_fee, notes, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, code, v.title, v.event_id, v.expected_attendees, v.entry_fee, v.notes, admin.id]);
      }
      for (let i = 0; i < v.items.length; i += 1) {
        const item = v.items[i];
        await client.query(
          'insert into event_plan_items (plan_id, kind, label, qty, unit_amount, per_head, sort_order) values ($1,$2,$3,$4,$5,$6,$7)',
          [id, item.kind, item.label, item.qty, item.unit_amount, item.per_head, i]);
      }
      await writeAudit({
        client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
        action: input?.id ? 'event_plan_updated' : 'event_plan_created', entity: 'event_plans', entityId: id,
        detail: { title: v.title, lines: v.items.length },
      });
      return { id, href: `/planner/${id}?ok=saved` };
    }),
  });
}

export async function deletePlan(formData) {
  const id = String(formData.get('id') || '');
  const admin = await guardForm('accountant', { back: '/planner' });
  if (!isUuid(id)) redirect('/planner?err=not_found');
  await tryForm('/planner', 'deletePlan', () => tx(async (client) => {
    const res = await client.query('update event_plans set deleted_at = now() where id = $1 and deleted_at is null returning title', [id]);
    if (!res.rowCount) throw new Error('NOT_FOUND');
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'event_plan_deleted', entity: 'event_plans', entityId: id, detail: { title: res.rows[0].title },
    });
  }));
  redirect('/planner?ok=removed');
}
