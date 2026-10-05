'use server';

import { redirect } from 'next/navigation';
import { writeAudit } from '../../adminAuth';
import { isEmailConfigured, sendReceiptEmail, describeMailError } from '../../email';
import { deliverReceipt } from '../../fulfil';
import { tx, one, isUuid } from '../db';
import { audit, clientIp } from '../auth';
import { runAction, guardForm, tryForm, withParam } from '../actionKit';
import { incomeSchema, optText } from '../schemas';
import { insertIncome, resolvePerson } from '../money';
import { fyOf } from '../format';
import { loadReceiptFacts, buildReceiptPdf, receiptFileName, towardsText } from '../receiptPdf';

const DONOR_KINDS = ['donation', 'csr_grant', 'sponsorship'];

/** Step form: record money received. One receipt + one income entry, in one transaction. */
export async function saveIncome(input) {
  return runAction({
    minimum: 'accountant', schema: incomeSchema, input, label: 'saveIncome',
    work: (admin, v) => tx(async (client) => {
      const person = await resolvePerson(client, v.person, {
        role: DONOR_KINDS.includes(v.kind) ? 'donor' : null,
        extra: { phone: v.donor_phone, email: v.donor_email, address: v.donor_address, pan: v.donor_pan },
      });
      const saved = await insertIncome(client, admin, { ...v, person_id: person.id, payer_name: person.name });
      await writeAudit({
        client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
        action: 'income_created', entity: 'income_entries', entityId: saved.id,
        after: saved.row, detail: { code: saved.code, receipt: saved.receiptCode, new_person: person.created },
      });
      return { id: saved.id, href: `/donations/${saved.id}?ok=saved` };
    }),
  });
}

/** Step form: correct an existing entry. Needs the e-mailed code; keeps before and after in the audit log. */
export async function updateIncome(input) {
  return runAction({
    minimum: 'accountant', otp: true, schema: incomeSchema, input, label: 'updateIncome',
    work: (admin, v) => tx(async (client) => {
      if (!isUuid(v.id)) throw new Error('NOT_FOUND');
      const { rows } = await client.query('select * from income_entries where id = $1 and deleted_at is null for update', [v.id]);
      const before = rows[0];
      if (!before) throw new Error('NOT_FOUND');
      const person = await resolvePerson(client, v.person, { role: DONOR_KINDS.includes(before.kind) ? 'donor' : null });
      const fy = fyOf(v.entry_date);
      const [year, month] = v.entry_date.split('-').map(Number);
      const updated = await client.query(
        `update income_entries set entry_date = $2, fy = $3, cal_year = $4, cal_month = $5, amount = $6,
                person_id = $7, payer_as_written = $8, mode = $9, bank_account_id = $10, payment_ref = $11,
                purpose_as_written = $12, fund_id = $13, event_id = $14, scheme_id = $15, category_id = $16,
                notes = $17, updated_at = now()
          where id = $1 returning *`,
        [v.id, v.entry_date, fy, year, month, v.amount, person.id, person.name, v.mode, v.bank_account_id,
          v.payment_ref, v.purpose, v.fund_id, v.event_id, v.scheme_id, v.category_id, v.notes]
      );
      if (before.receipt_id) {
        await client.query('update receipts set receipt_date = $2, updated_at = now() where id = $1', [before.receipt_id, v.entry_date]);
      }
      await writeAudit({
        client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
        action: 'income_updated', entity: 'income_entries', entityId: v.id, before, after: updated.rows[0],
      });
      return { id: v.id, href: `/donations/${v.id}?ok=updated` };
    }),
  });
}

/** Removes an entry from the books (kept, marked deleted) and cancels its receipt. Admin + code + a reason. */
export async function deleteIncome(formData) {
  const id = String(formData.get('id') || '');
  const back = isUuid(id) ? `/donations/${id}` : '/donations';
  const admin = await guardForm('admin', { otp: true, back });
  const reason = optText(300).safeParse(formData.get('reason'));
  if (!isUuid(id)) redirect('/donations?err=not_found');
  if (!reason.success || !reason.data || reason.data.length < 3) redirect(withParam(back, 'err', 'reason'));

  await tryForm(back, 'deleteIncome', () => tx(async (client) => {
    const { rows } = await client.query('select * from income_entries where id = $1 and deleted_at is null for update', [id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    await client.query('update income_entries set deleted_at = now(), updated_at = now() where id = $1', [id]);
    if (rows[0].receipt_id) {
      await client.query(
        `update receipts set is_cancelled = true, updated_at = now(),
                notes = concat_ws(E'\n', notes, $2::text) where id = $1`,
        [rows[0].receipt_id, `Cancelled: ${reason.data}`]);
    }
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'income_deleted', entity: 'income_entries', entityId: id, before: rows[0], detail: { reason: reason.data },
    });
  }));
  redirect('/donations?ok=deleted');
}

/** E-mails the receipt PDF of a hand-entered receipt to the payer. */
export async function emailReceipt(formData) {
  const id = String(formData.get('id') || '');
  const back = isUuid(id) ? `/donations/${id}` : '/donations';
  const admin = await guardForm('accountant', { back });
  if (!isUuid(id)) redirect('/donations?err=not_found');

  const facts = await loadReceiptFacts(id);
  if (!facts || facts.deleted_at || facts.is_cancelled || facts.receipt_origin !== 'manual') redirect(withParam(back, 'err', 'no_receipt'));
  if (!facts.email) redirect(withParam(back, 'err', 'no_email'));
  if (!isEmailConfigured()) redirect(withParam(back, 'err', 'mail'));

  let failed = false;
  try {
    const pdf = await buildReceiptPdf(facts);
    await sendReceiptEmail({
      to: facts.email, payerName: facts.name_en || facts.payer_as_written, receiptNo: facts.receipt_code,
      amount: facts.amount, towards: towardsText(facts), pdfBuffer: pdf, fileName: receiptFileName(facts),
      membershipNo: facts.kind === 'membership_fee' ? facts.membership_code : null,
      isMembership: facts.kind === 'membership_fee', membershipType: facts.kind === 'membership_fee' ? facts.tier : null,
    });
  } catch (err) {
    console.error('[TMS] receipt e-mail failed:', describeMailError(err));
    failed = true;
  }
  await audit(admin, {
    action: failed ? 'receipt_email_failed' : 'receipt_emailed', entity: 'income_entries', entityId: id,
    detail: { receipt: facts.receipt_code, to: facts.email },
  });
  redirect(withParam(back, failed ? 'err' : 'ok', failed ? 'mail' : 'emailed'));
}

/** Re-sends the receipt of an online (Razorpay) payment, exactly as the public site does. */
export async function resendOnlineReceipt(formData) {
  const admin = await guardForm('accountant', { back: '/payments' });
  const paymentId = String(formData.get('paymentId') || '');
  if (!isUuid(paymentId)) redirect('/payments?err=not_found');
  const payment = await one("select id from payments where id = $1 and status = 'paid'", [paymentId]);
  if (!payment) redirect('/payments?err=not_found');

  let failed = false;
  try {
    await deliverReceipt(paymentId);
  } catch (err) {
    console.error('[TMS] online receipt re-send failed:', err?.message);
    failed = true;
  }
  await audit(admin, { action: failed ? 'receipt_resend_failed' : 'receipt_resent', entity: 'payment', entityId: paymentId });
  redirect(failed ? '/payments?err=mail' : '/payments?ok=emailed');
}
