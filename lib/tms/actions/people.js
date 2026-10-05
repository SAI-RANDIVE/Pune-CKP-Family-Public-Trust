'use server';

import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { writeAudit } from '../../adminAuth';
import { issueCode } from '../../ids';
import { computeNewMembership, computeRenewal } from '../../pricing';
import { tx, isUuid } from '../db';
import { clientIp } from '../auth';
import { runAction, guardForm, tryForm, withParam } from '../actionKit';
import { personSchema, amount, date, optDate, optText, optUuid, uuid, MODES, TIERS, check } from '../schemas';
import { insertIncome, nameKey } from '../money';
import { isoDate, maskId } from '../format';
import { OFFICER_TITLES } from '../constants';

const masked = (row) => (row ? { ...row, pan: row.pan ? maskId(row.pan) : null, aadhaar: row.aadhaar ? maskId(row.aadhaar) : null } : row);

/** Step form: add a person, or correct one (when input.id is set). */
export async function savePerson(input) {
  return runAction({
    minimum: 'accountant', schema: personSchema, input, label: 'savePerson',
    work: (admin, v) => tx(async (client) => {
      const fields = [v.name_en, v.name_mr, nameKey(v.name_en), v.phone, v.phone_alt, v.email, v.address, v.city,
        v.pincode, v.pan ?? null, v.aadhaar ?? null, v.date_of_birth, v.blood_group, v.roles, v.notes];
      if (v.id) {
        if (!isUuid(v.id)) throw new Error('NOT_FOUND');
        const { rows } = await client.query('select * from people where id = $1 and deleted_at is null for update', [v.id]);
        if (!rows.length) throw new Error('NOT_FOUND');
        const updated = await client.query(
          `update people set name_en = $2, name_mr = $3, name_key = $4, phone = $5, phone_alt = $6, email = $7,
                  address = $8, city = $9, pincode = $10, pan = $11, aadhaar = $12, date_of_birth = $13,
                  blood_group = $14, roles = $15, notes = $16, updated_at = now()
            where id = $1 returning *`, [v.id, ...fields]);
        if (rows[0].name_en && rows[0].name_en !== v.name_en) {
          await client.query(
            `insert into person_name_variants (person_id, name, source) values ($1, $2, 'earlier name')
             on conflict (person_id, name) do nothing`, [v.id, rows[0].name_en]);
        }
        await writeAudit({
          client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
          action: 'person_updated', entity: 'people', entityId: v.id, before: masked(rows[0]), after: masked(updated.rows[0]),
        });
        return { id: v.id, href: `/people/${v.id}?ok=updated` };
      }
      const id = crypto.randomUUID();
      const code = await issueCode(client, 'people', { id });
      const inserted = await client.query(
        `insert into people (id, code, name_en, name_mr, name_key, phone, phone_alt, email, address, city, pincode,
                             pan, aadhaar, date_of_birth, blood_group, roles, notes, origin)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'manual') returning *`,
        [id, code, ...fields]);
      await writeAudit({
        client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
        action: 'person_created', entity: 'people', entityId: id, after: masked(inserted.rows[0]),
      });
      return { id, href: `/people/${id}?ok=saved` };
    }),
  });
}

const paymentPart = {
  amount,
  mode: z.enum(MODES, { required_error: 'required', invalid_type_error: 'required' }),
  payment_ref: optText(80),
  entry_date: date({ future: 0 }),
  notes: optText(500),
};

const membershipSchema = z.object({ person_id: uuid, tier: z.enum(TIERS), ...paymentPart });
const renewalSchema = z.object({ membership_id: uuid, ...paymentPart });

const localDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

/** Confirm screen of "new membership": creates the membership, its receipt and its fee entry together. */
export async function saveMembership(formData) {
  const personId = String(formData.get('person_id') || '');
  const back = `/members/new?person=${isUuid(personId) ? personId : ''}`;
  const admin = await guardForm('accountant', { back });
  const parsed = check(membershipSchema, Object.fromEntries(['person_id', 'tier', 'amount', 'mode', 'payment_ref', 'entry_date', 'notes'].map((k) => [k, formData.get(k)])));
  if (!parsed.ok) redirect(withParam(`${back}&tier=${encodeURIComponent(String(formData.get('tier') || ''))}&start=${encodeURIComponent(String(formData.get('entry_date') || ''))}`, 'err', Object.values(parsed.errors)[0]));
  const v = parsed.data;

  await tryForm(back, 'saveMembership', () => tx(async (client) => {
    const { rows: people } = await client.query(
      'select id, name_en, name_mr from people where id = $1 and deleted_at is null and merged_into_id is null for update', [v.person_id]);
    if (!people.length) throw new Error('PERSON_NOT_FOUND');
    const { rows: existing } = await client.query(
      "select 1 from memberships where person_id = $1 and deleted_at is null and status = 'active' limit 1", [v.person_id]);
    if (existing.length) throw new Error('CONFLICT');

    const terms = computeNewMembership(v.tier, localDate(v.entry_date));
    const id = crypto.randomUUID();
    const code = await issueCode(client, 'memberships', { id, tier: v.tier });
    const inserted = await client.query(
      `insert into memberships (id, code, person_id, tier, start_date, expiry_date, status, date_rule, notes, origin)
       values ($1,$2,$3,$4,$5,$6,'active','lib/pricing.js computeNewMembership',$7,'manual') returning *`,
      [id, code, v.person_id, v.tier, terms.validFrom, terms.validTill, v.notes]);
    await client.query(
      `update people set roles = array_append(roles, 'member'), updated_at = now() where id = $1 and not ('member' = any(roles))`, [v.person_id]);
    const income = await insertIncome(client, admin, {
      ...v, kind: 'membership_fee', person_id: v.person_id, payer_name: people[0].name_en || people[0].name_mr,
      purpose: `Membership ${v.tier}, new`,
    }, { membershipId: id });
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'membership_created', entity: 'memberships', entityId: id, after: inserted.rows[0],
      detail: { code, income: income.code, receipt: income.receiptCode, amount: v.amount },
    });
  }));
  redirect(`/people/${v.person_id}?ok=member_added`);
}

/** Confirm screen of "renew": extends the expiry by the rule in lib/pricing.js and records the fee. */
export async function renewMembership(formData) {
  const membershipId = String(formData.get('membership_id') || '');
  const back = `/members/renew/${isUuid(membershipId) ? membershipId : ''}`;
  const admin = await guardForm('accountant', { back });
  const parsed = check(renewalSchema, Object.fromEntries(['membership_id', 'amount', 'mode', 'payment_ref', 'entry_date', 'notes'].map((k) => [k, formData.get(k)])));
  if (!parsed.ok) redirect(withParam(back, 'err', Object.values(parsed.errors)[0]));
  const v = parsed.data;

  const personId = await tryForm(back, 'renewMembership', () => tx(async (client) => {
    const { rows } = await client.query(
      `select m.*, p.name_en, p.name_mr from memberships m join people p on p.id = m.person_id
        where m.id = $1 and m.deleted_at is null for update of m`, [v.membership_id]);
    const before = rows[0];
    if (!before) throw new Error('NOT_FOUND');
    if (!before.expiry_date || !TIERS.includes(before.tier)) throw new Error('CONFLICT');
    const terms = computeRenewal(before.tier, isoDate(before.expiry_date));
    const updated = await client.query(
      `update memberships set expiry_date = $2, status = 'active', updated_at = now(), dates_derived = false,
              date_rule = 'lib/pricing.js computeRenewal' where id = $1 returning *`, [before.id, terms.validTill]);
    const income = await insertIncome(client, admin, {
      ...v, kind: 'membership_fee', person_id: before.person_id, payer_name: before.name_en || before.name_mr,
      purpose: `Membership ${before.tier}, renewal`,
    }, { membershipId: before.id });
    const { name_en: _n, name_mr: _m, ...beforeRow } = before;
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'membership_renewed', entity: 'memberships', entityId: before.id, before: beforeRow, after: updated.rows[0],
      detail: { income: income.code, receipt: income.receiptCode, amount: v.amount },
    });
    return before.person_id;
  }));
  redirect(`/people/${personId}?ok=renewed`);
}

const officerSchema = z.object({
  person_id: uuid,
  title: z.enum(OFFICER_TITLES.map((o) => o.key)),
  from_date: optDate({ future: 366 }),
  to_date: optDate({ future: 3660 }),
  admin_user_id: optUuid,
});

/** Records that a person holds an office (President, Secretary, Treasurer, Trustee ...). */
export async function saveOfficer(formData) {
  const personId = String(formData.get('person_id') || '');
  const back = isUuid(personId) ? `/people/${personId}` : '/officers';
  const admin = await guardForm('admin', { back });
  const parsed = check(officerSchema, Object.fromEntries(['person_id', 'title', 'from_date', 'to_date', 'admin_user_id'].map((k) => [k, formData.get(k)])));
  if (!parsed.ok) redirect(withParam(back, 'err', Object.values(parsed.errors)[0]));
  const v = parsed.data;
  if (v.from_date && v.to_date && v.to_date < v.from_date) redirect(withParam(back, 'err', 'date'));
  const title = OFFICER_TITLES.find((o) => o.key === v.title);

  await tryForm(back, 'saveOfficer', () => tx(async (client) => {
    const { rows: people } = await client.query('select id from people where id = $1 and deleted_at is null', [v.person_id]);
    if (!people.length) throw new Error('PERSON_NOT_FOUND');
    const inserted = await client.query(
      `insert into trust_officers (person_id, title_en, title_mr, from_date, to_date, display_order, admin_user_id)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [v.person_id, title.en, title.mr, v.from_date, v.to_date, title.order, v.admin_user_id]);
    await client.query(
      `update people set roles = array_append(roles, 'trustee'), updated_at = now() where id = $1 and not ('trustee' = any(roles))`, [v.person_id]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'officer_added', entity: 'trust_officers', entityId: inserted.rows[0].id, after: inserted.rows[0],
    });
  }));
  redirect(withParam(back, 'ok', 'saved'));
}

/** Sets the date an office ended. */
export async function endOfficer(formData) {
  const admin = await guardForm('admin', { back: '/officers' });
  const id = String(formData.get('id') || '');
  const to = optDate({ future: 366 }).safeParse(formData.get('to_date'));
  if (!isUuid(id) || !to.success || !to.data) redirect('/officers?err=date');

  await tryForm('/officers', 'endOfficer', () => tx(async (client) => {
    const { rows } = await client.query('select * from trust_officers where id = $1 and deleted_at is null for update', [id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    const updated = await client.query('update trust_officers set to_date = $2 where id = $1 returning *', [id, to.data]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'officer_ended', entity: 'trust_officers', entityId: id, before: rows[0], after: updated.rows[0],
    });
  }));
  redirect('/officers?ok=updated');
}
