import { getPool } from './db';

/** Indian financial year label for a date, e.g. 1-Jul-2026 -> "26-27". */
export function financialYearLabel(date = new Date()) {
  const y = date.getFullYear();
  const fyStart = date.getMonth() >= 3 ? y : y - 1; // April = month index 3
  const two = (n) => String(n % 100).padStart(2, '0');
  return `${two(fyStart)}-${two(fyStart + 1)}`;
}

async function nextSeq(key) {
  const pool = getPool();
  const { rows } = await pool.query(
    `insert into receipt_counters (financial_year, last_seq)
     values ($1, 1)
     on conflict (financial_year)
     do update set last_seq = receipt_counters.last_seq + 1
     returning last_seq`,
    [key]
  );
  return rows[0].last_seq;
}

/** e.g. "M/26-27/032" — matches the trust's existing receipt-book format. */
export async function nextReceiptNo(date = new Date()) {
  const fy = financialYearLabel(date);
  const seq = await nextSeq(`receipt-${fy}`);
  return `M/${fy}/${String(seq).padStart(3, '0')}`;
}

const TYPE_PREFIX = { silver: 'SM', gold: 'GM', platinum: 'PM' };

/** e.g. "SM/26/173" for a new Silver member joining in 2026. */
export async function nextMembershipNo(type, date = new Date()) {
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  const prefix = TYPE_PREFIX[type] || 'MM';
  const seq = await nextSeq(`member-${prefix}-${yy}`);
  return `${prefix}/${yy}/${String(seq).padStart(3, '0')}`;
}
