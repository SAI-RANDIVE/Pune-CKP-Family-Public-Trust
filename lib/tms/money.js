import crypto from 'crypto';
import { issueCode } from '../ids';
import { fyOf } from './format';

/**
 * Writes for money records. Every function here takes a pg client that is
 * already inside a transaction (lib/tms/db.js tx), so the record, its trust ID
 * (issueCode) and its audit row are saved together or not at all.
 */

export const nameKey = (name) => String(name || '').toLowerCase().normalize('NFKD')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

/**
 * Returns the id of the person a form refers to: the existing record when one
 * was picked, otherwise a new people row with a PCFPT/PER id.
 */
export async function resolvePerson(client, ref, { role = null, extra = {} } = {}) {
  if (!ref) return { id: null, name: null, created: false };
  if (ref.id) {
    const { rows } = await client.query(
      `select coalesce(k.id, p.id) as id, coalesce(k.name_en, k.name_mr, p.name_en, p.name_mr) as name
         from people p left join people k on k.id = p.merged_into_id
        where p.id = $1`, [ref.id]);
    if (!rows.length) throw new Error('PERSON_NOT_FOUND');
    const { id, name } = rows[0];
    if (role) {
      await client.query(
        `update people set roles = array_append(roles, $2::text), updated_at = now()
          where id = $1 and not ($2::text = any(roles))`, [id, role]);
    }
    return { id, name, created: false };
  }

  const id = crypto.randomUUID();
  const code = await issueCode(client, 'people', { id });
  await client.query(
    `insert into people (id, code, name_en, name_key, phone, email, address, pan, roles, origin)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual')`,
    [id, code, ref.name, nameKey(ref.name), extra.phone || null, extra.email || null,
      extra.address || null, extra.pan || null, role ? [role] : []]
  );
  return { id, name: ref.name, created: true, code };
}

const serialOf = (code) => Number.parseInt(String(code).split('/').pop(), 10);

/**
 * Records money received: one receipts row and one income_entries row, both
 * with new trust IDs, origin 'manual'. Returns the new ids and codes.
 */
export async function insertIncome(client, admin, v, { membershipId = null } = {}) {
  const fy = fyOf(v.entry_date);
  const [year, month] = v.entry_date.split('-').map(Number);

  const receiptId = crypto.randomUUID();
  const receiptCode = await issueCode(client, 'receipts', { id: receiptId, fy });
  await client.query(
    `insert into receipts (id, code, fy, series, number, number_as_written, receipt_date, origin)
     values ($1,$2,$3,'TMS',$4,$2,$5,'manual')`,
    [receiptId, receiptCode, fy, serialOf(receiptCode), v.entry_date]
  );

  const id = crypto.randomUUID();
  const code = await issueCode(client, 'income_entries', { id, fy, kind: v.kind });
  const { rows } = await client.query(
    `insert into income_entries
       (id, code, entry_date, fy, cal_year, cal_month, amount, kind, person_id, payer_as_written,
        receipt_id, membership_id, mode, bank_account_id, payment_ref, purpose_as_written,
        fund_id, event_id, scheme_id, category_id, pan_as_written, notes, origin, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'manual',$23)
     returning *`,
    [id, code, v.entry_date, fy, year, month, v.amount, v.kind, v.person_id, v.payer_name,
      receiptId, membershipId, v.mode, v.bank_account_id || null, v.payment_ref || null, v.purpose || null,
      v.fund_id || null, v.event_id || null, v.scheme_id || null, v.category_id || null,
      v.donor_pan || null, v.notes || null, admin.id]
  );
  return { id, code, receiptId, receiptCode, row: rows[0] };
}

/** Records a payment voucher. Returns the new id, code and row. */
export async function insertExpense(client, admin, v) {
  const fy = fyOf(v.entry_date);
  const [year, month] = v.entry_date.split('-').map(Number);
  const id = crypto.randomUUID();
  const code = await issueCode(client, 'expenses', { id, fy });
  const { rows } = await client.query(
    `insert into expenses
       (id, code, entry_date, fy, cal_year, cal_month, amount, cash_amount, bank_amount, voucher_no_as_written,
        payee_person_id, payee_as_written, category_id, particulars, mode, cheque_no, bank_account_id,
        event_id, scheme_id, fund_id, approved_by, notes, origin, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'manual',$23)
     returning *`,
    [id, code, v.entry_date, fy, year, month, v.amount, v.cash_amount, v.bank_amount, v.voucher_no || code,
      v.payee_person_id, v.payee_name, v.category_id, v.particulars, v.mode, v.cheque_no || null,
      v.bank_account_id || null, v.event_id || null, v.scheme_id || null, v.fund_id || null,
      v.approved_by || null, v.notes || null, admin.id]
  );
  return { id, code, row: rows[0] };
}

/** Cash and bank parts of a voucher: as entered, otherwise decided by how it was paid. */
export function splitAmounts(v) {
  if (v.cash_amount != null || v.bank_amount != null) {
    return { cash_amount: v.cash_amount || 0, bank_amount: v.bank_amount || 0 };
  }
  return v.mode === 'cash' ? { cash_amount: v.amount, bank_amount: 0 } : { cash_amount: 0, bank_amount: v.amount };
}
