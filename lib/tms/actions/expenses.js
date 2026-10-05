'use server';

import { redirect } from 'next/navigation';
import { writeAudit } from '../../adminAuth';
import { tx, isUuid } from '../db';
import { clientIp } from '../auth';
import { runAction, guardForm, tryForm, withParam } from '../actionKit';
import { expenseSchema, optText } from '../schemas';
import { insertExpense, resolvePerson, splitAmounts } from '../money';
import { fyOf } from '../format';

async function payeeOf(client, v) {
  if (v.payee) {
    const person = await resolvePerson(client, v.payee, { role: 'vendor' });
    return { payee_person_id: person.id, payee_name: person.name };
  }
  return { payee_person_id: null, payee_name: v.payee_text };
}

/** Step form: record a payment voucher. */
export async function saveExpense(input) {
  return runAction({
    minimum: 'accountant', schema: expenseSchema, input, label: 'saveExpense',
    work: (admin, v) => tx(async (client) => {
      const payee = await payeeOf(client, v);
      const saved = await insertExpense(client, admin, { ...v, ...payee, ...splitAmounts(v) });
      await writeAudit({
        client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
        action: 'expense_created', entity: 'expenses', entityId: saved.id, after: saved.row, detail: { code: saved.code },
      });
      return { id: saved.id, href: `/expenses/${saved.id}?ok=saved` };
    }),
  });
}

/** Step form: correct a voucher. Needs the e-mailed code. */
export async function updateExpense(input) {
  return runAction({
    minimum: 'accountant', otp: true, schema: expenseSchema, input, label: 'updateExpense',
    work: (admin, v) => tx(async (client) => {
      if (!isUuid(v.id)) throw new Error('NOT_FOUND');
      const { rows } = await client.query('select * from expenses where id = $1 and deleted_at is null for update', [v.id]);
      const before = rows[0];
      if (!before) throw new Error('NOT_FOUND');
      const payee = await payeeOf(client, v);
      const split = splitAmounts(v);
      const fy = fyOf(v.entry_date);
      const [year, month] = v.entry_date.split('-').map(Number);
      const updated = await client.query(
        `update expenses set entry_date = $2, fy = $3, cal_year = $4, cal_month = $5, amount = $6, cash_amount = $7,
                bank_amount = $8, payee_person_id = $9, payee_as_written = $10, category_id = $11, particulars = $12,
                mode = $13, cheque_no = $14, bank_account_id = $15, event_id = $16, scheme_id = $17, fund_id = $18,
                approved_by = $19, notes = $20, voucher_no_as_written = coalesce($21, voucher_no_as_written), updated_at = now()
          where id = $1 returning *`,
        [v.id, v.entry_date, fy, year, month, v.amount, split.cash_amount, split.bank_amount, payee.payee_person_id,
          payee.payee_name, v.category_id, v.particulars, v.mode, v.cheque_no, v.bank_account_id, v.event_id,
          v.scheme_id, v.fund_id, v.approved_by, v.notes, v.voucher_no]
      );
      await writeAudit({
        client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
        action: 'expense_updated', entity: 'expenses', entityId: v.id, before, after: updated.rows[0],
      });
      return { id: v.id, href: `/expenses/${v.id}?ok=updated` };
    }),
  });
}

/** Removes a voucher from the books (kept, marked deleted). Admin + code + a reason. */
export async function deleteExpense(formData) {
  const id = String(formData.get('id') || '');
  const back = isUuid(id) ? `/expenses/${id}` : '/expenses';
  const admin = await guardForm('admin', { otp: true, back });
  const reason = optText(300).safeParse(formData.get('reason'));
  if (!isUuid(id)) redirect('/expenses?err=not_found');
  if (!reason.success || !reason.data || reason.data.length < 3) redirect(withParam(back, 'err', 'reason'));

  await tryForm(back, 'deleteExpense', () => tx(async (client) => {
    const { rows } = await client.query('select * from expenses where id = $1 and deleted_at is null for update', [id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    await client.query('update expenses set deleted_at = now(), updated_at = now() where id = $1', [id]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'expense_deleted', entity: 'expenses', entityId: id, before: rows[0], detail: { reason: reason.data },
    });
  }));
  redirect('/expenses?ok=deleted');
}
