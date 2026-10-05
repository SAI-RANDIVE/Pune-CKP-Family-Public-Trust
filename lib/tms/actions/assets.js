'use server';

import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { writeAudit } from '../../adminAuth';
import { issueCode } from '../../ids';
import { tx, isUuid } from '../db';
import { clientIp } from '../auth';
import { runAction, guardForm, tryForm, withParam } from '../actionKit';
import { fdSchema, fdEventSchema, disbursementSchema, optAmount, date, optText, text, uuid, check } from '../schemas';
import { resolvePerson } from '../money';
import { fyOf } from '../format';

/* ---------------- fixed deposits ---------------- */

/** Step form: add a fixed deposit. With input.renewed_from_id it also marks the old deposit as renewed. */
export async function saveDeposit(input) {
  return runAction({
    minimum: 'accountant', schema: fdSchema, input, label: 'saveDeposit',
    work: (admin, v) => tx(async (client) => {
      const fromId = isUuid(input?.renewed_from_id) ? input.renewed_from_id : null;
      let old = null;
      if (fromId) {
        const { rows } = await client.query('select * from fixed_deposits where id = $1 and deleted_at is null for update', [fromId]);
        old = rows[0];
        if (!old) throw new Error('NOT_FOUND');
        if (!['active', 'matured', 'unknown'].includes(old.status)) throw new Error('CONFLICT');
      }
      const id = crypto.randomUUID();
      const code = await issueCode(client, 'fixed_deposits', { id });
      const inserted = await client.query(
        `insert into fixed_deposits (id, code, bank, branch, fd_number, principal, rate_pct, start_date, maturity_date,
                                     maturity_amount, status, renewed_from_id, fund_id, notes, origin)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12,$13,'manual') returning *`,
        [id, code, v.bank, v.branch, v.fd_number, v.principal, v.rate_pct, v.start_date, v.maturity_date,
          v.maturity_amount, fromId, v.fund_id, v.notes]);
      await writeAudit({
        client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
        action: 'fd_created', entity: 'fixed_deposits', entityId: id, after: inserted.rows[0], detail: { code, renewed_from: old?.code || null },
      });
      if (old) {
        const updated = await client.query("update fixed_deposits set status = 'renewed', updated_at = now() where id = $1 returning *", [old.id]);
        await client.query(
          `insert into fd_events (fixed_deposit_id, event_date, fy, kind, amount, label_as_written)
           values ($1,$2,$3,'renewal',$4,$5)`, [old.id, v.start_date, fyOf(v.start_date), v.principal, `Renewed as ${code}`]);
        await writeAudit({
          client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
          action: 'fd_renewed', entity: 'fixed_deposits', entityId: old.id, before: old, after: updated.rows[0], detail: { renewed_as: code },
        });
      }
      return { id, href: `/deposits/${id}?ok=saved` };
    }),
  });
}

const closeSchema = z.object({
  id: uuid,
  status: z.enum(['matured', 'closed']),
  event_date: date({ future: 0 }),
  amount: optAmount,
});

/** Marks a deposit as matured or closed; an amount received is kept as a closure entry. */
export async function closeDeposit(formData) {
  const id = String(formData.get('id') || '');
  const back = isUuid(id) ? `/deposits/${id}` : '/deposits';
  const admin = await guardForm('accountant', { back });
  const parsed = check(closeSchema, Object.fromEntries(['id', 'status', 'event_date', 'amount'].map((k) => [k, formData.get(k)])));
  if (!parsed.ok) redirect(withParam(back, 'err', Object.values(parsed.errors)[0]));
  const v = parsed.data;

  await tryForm(back, 'closeDeposit', () => tx(async (client) => {
    const { rows } = await client.query('select * from fixed_deposits where id = $1 and deleted_at is null for update', [v.id]);
    const before = rows[0];
    if (!before) throw new Error('NOT_FOUND');
    if (!['active', 'unknown', 'matured'].includes(before.status)) throw new Error('CONFLICT');
    const updated = await client.query('update fixed_deposits set status = $2, updated_at = now() where id = $1 returning *', [v.id, v.status]);
    if (v.amount != null) {
      await client.query(
        `insert into fd_events (fixed_deposit_id, event_date, fy, kind, amount, label_as_written) values ($1,$2,$3,'closure',$4,$5)`,
        [v.id, v.event_date, fyOf(v.event_date), v.amount, v.status === 'closed' ? 'Closed' : 'Matured']);
    }
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: `fd_${v.status}`, entity: 'fixed_deposits', entityId: v.id, before, after: updated.rows[0], detail: { date: v.event_date, amount: v.amount },
    });
  }));
  redirect(withParam(back, 'ok', 'updated'));
}

/** Adds an interest or TDS entry to a deposit. */
export async function addDepositEvent(formData) {
  const id = String(formData.get('fixed_deposit_id') || '');
  const back = isUuid(id) ? `/deposits/${id}` : '/deposits';
  const admin = await guardForm('accountant', { back });
  const parsed = check(fdEventSchema, Object.fromEntries(['fixed_deposit_id', 'kind', 'event_date', 'amount', 'label'].map((k) => [k, formData.get(k)])));
  if (!parsed.ok) redirect(withParam(back, 'err', Object.values(parsed.errors)[0]));
  const v = parsed.data;

  await tryForm(back, 'addDepositEvent', () => tx(async (client) => {
    const { rows } = await client.query('select id from fixed_deposits where id = $1 and deleted_at is null', [v.fixed_deposit_id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    const inserted = await client.query(
      `insert into fd_events (fixed_deposit_id, event_date, fy, kind, amount, label_as_written) values ($1,$2,$3,$4,$5,$6) returning *`,
      [v.fixed_deposit_id, v.event_date, fyOf(v.event_date), v.kind, v.amount, v.label]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: `fd_${v.kind}_added`, entity: 'fd_events', entityId: inserted.rows[0].id, after: inserted.rows[0],
    });
  }));
  redirect(withParam(back, 'ok', 'saved'));
}

/* ---------------- schemes ---------------- */

/** Step form: record help given (paid) or promised (planned) under a scheme. */
export async function saveDisbursement(input) {
  return runAction({
    minimum: 'accountant', schema: disbursementSchema, input, label: 'saveDisbursement',
    work: (admin, v) => tx(async (client) => {
      const { rows: schemes } = await client.query('select id, is_repayable from schemes where id = $1', [v.scheme_id]);
      if (!schemes.length) throw new Error('NOT_FOUND');
      const person = v.person ? await resolvePerson(client, v.person, { role: 'beneficiary' }) : { id: null, name: null };
      const fy = fyOf(v.disbursed_on);
      const id = crypto.randomUUID();
      const code = await issueCode(client, 'scheme_disbursements', { id, fy });
      const inserted = await client.query(
        `insert into scheme_disbursements (id, code, scheme_id, person_id, beneficiary_as_written, beneficiary_count, fy,
                                           disbursed_on, amount, institution, is_repayable, notes, status, origin)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'manual') returning *`,
        [id, code, v.scheme_id, person.id, person.name || v.beneficiary_text, v.beneficiary_count, fy, v.disbursed_on,
          v.amount, v.institution, schemes[0].is_repayable, v.notes, v.status]);
      await writeAudit({
        client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
        action: 'disbursement_created', entity: 'scheme_disbursements', entityId: id, after: inserted.rows[0], detail: { code },
      });
      return { id, href: `/schemes/${v.scheme_id}?ok=saved` };
    }),
  });
}

/** A planned amount has now actually been paid. */
export async function markDisbursementPaid(formData) {
  const schemeId = String(formData.get('scheme_id') || '');
  const back = isUuid(schemeId) ? `/schemes/${schemeId}` : '/schemes';
  const admin = await guardForm('accountant', { back });
  const id = String(formData.get('id') || '');
  const paidOn = date({ future: 0 }).safeParse(formData.get('disbursed_on'));
  if (!isUuid(id) || !paidOn.success) redirect(withParam(back, 'err', 'date'));

  await tryForm(back, 'markDisbursementPaid', () => tx(async (client) => {
    const { rows } = await client.query("select * from scheme_disbursements where id = $1 and deleted_at is null and status = 'planned' for update", [id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    const fy = fyOf(paidOn.data);
    const updated = await client.query(
      "update scheme_disbursements set status = 'paid', disbursed_on = $2, fy = $3, updated_at = now() where id = $1 returning *", [id, paidOn.data, fy]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'disbursement_paid', entity: 'scheme_disbursements', entityId: id, before: rows[0], after: updated.rows[0],
    });
  }));
  redirect(withParam(back, 'ok', 'updated'));
}

const applicationSchema = z.object({
  scheme_id: uuid,
  applicant: text(160, 2),
  applied_on: date({ future: 0 }),
  institution: optText(200),
  status: z.enum(['received', 'approved', 'rejected', 'disbursed']),
});

/** Records an application received under a scheme. */
export async function saveApplication(formData) {
  const schemeId = String(formData.get('scheme_id') || '');
  const back = isUuid(schemeId) ? `/schemes/${schemeId}` : '/schemes';
  const admin = await guardForm('accountant', { back });
  const parsed = check(applicationSchema, Object.fromEntries(['scheme_id', 'applicant', 'applied_on', 'institution', 'status'].map((k) => [k, formData.get(k)])));
  if (!parsed.ok) redirect(withParam(back, 'err', Object.values(parsed.errors)[0]));
  const v = parsed.data;

  await tryForm(back, 'saveApplication', () => tx(async (client) => {
    const { rows } = await client.query('select id from schemes where id = $1', [v.scheme_id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    const fy = fyOf(v.applied_on);
    const id = crypto.randomUUID();
    const code = await issueCode(client, 'scheme_applications', { id, fy });
    const inserted = await client.query(
      `insert into scheme_applications (id, code, scheme_id, applicant_as_written, fy, applied_on, institution, status, origin)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'manual') returning *`,
      [id, code, v.scheme_id, v.applicant, fy, v.applied_on, v.institution, v.status]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'application_created', entity: 'scheme_applications', entityId: id, after: inserted.rows[0],
    });
  }));
  redirect(withParam(back, 'ok', 'saved'));
}

/** Changes where an application stands. */
export async function setApplicationStatus(formData) {
  const schemeId = String(formData.get('scheme_id') || '');
  const back = isUuid(schemeId) ? `/schemes/${schemeId}` : '/schemes';
  const admin = await guardForm('accountant', { back });
  const id = String(formData.get('id') || '');
  const status = z.enum(['received', 'approved', 'rejected', 'disbursed']).safeParse(formData.get('status'));
  if (!isUuid(id) || !status.success) redirect(withParam(back, 'err', 'required'));

  await tryForm(back, 'setApplicationStatus', () => tx(async (client) => {
    const { rows } = await client.query('select * from scheme_applications where id = $1 and deleted_at is null for update', [id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    const updated = await client.query('update scheme_applications set status = $2, updated_at = now() where id = $1 returning *', [id, status.data]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'application_status', entity: 'scheme_applications', entityId: id, before: rows[0], after: updated.rows[0],
    });
  }));
  redirect(withParam(back, 'ok', 'updated'));
}
