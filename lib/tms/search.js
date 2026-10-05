import { q, likeParam } from './db';
import { devanagariToLatin, hasDevanagari } from './translit';

/**
 * Fuzzy people search: pg_trgm word similarity plus plain "contains", over
 * English and Marathi names, every recorded spelling of the name, phone,
 * e-mail and the person's trust ID. A name typed in Marathi is also tried in
 * a rough Latin spelling, because most of the old registers are in English.
 */

const PEOPLE_MATCH = `
  p.deleted_at is null and p.merged_into_id is null and (
       p.name_en ilike $2 or p.name_mr ilike $2 or p.name_en ilike $4 or p.code ilike $2 or p.email ilike $2
    or word_similarity($3, coalesce(p.name_en, '')) >= 0.45
    or word_similarity($1, coalesce(p.name_mr, '')) >= 0.45
    or exists (select 1 from person_name_variants v where v.person_id = p.id
                and (v.name ilike $2 or v.name ilike $4 or word_similarity($3, v.name) >= 0.5))
    or ($5 <> '' and (p.phone like '%' || $5 || '%' or p.phone_alt like '%' || $5 || '%'))
  )`;

const PEOPLE_SCORE = `greatest(
    word_similarity($3, coalesce(p.name_en, '')), word_similarity($1, coalesce(p.name_mr, '')),
    case when p.name_en ilike $2 or p.name_en ilike $4 or p.name_mr ilike $2 then 0.9 else 0 end,
    case when lower(p.code) = lower($1) then 1 else 0 end,
    case when $5 <> '' and (p.phone like '%' || $5 || '%' or p.phone_alt like '%' || $5 || '%') then 0.95 else 0 end)`;

/** The five parameters every people-search statement takes, in order. */
export function peopleSearchParams(term) {
  const raw = String(term || '').trim();
  const latin = hasDevanagari(raw) ? devanagariToLatin(raw).trim() : raw;
  const digits = raw.replace(/\D/g, '');
  return [raw, likeParam(raw), latin || raw, likeParam(latin || raw), digits.length >= 4 ? digits : ''];
}

export { PEOPLE_MATCH, PEOPLE_SCORE };

export async function searchPeople(term, limit = 20) {
  const params = peopleSearchParams(term);
  if (params[0].length < 2) return [];
  return q(
    `select p.id, p.code, p.name_en, p.name_mr, p.phone, p.email, p.city, p.roles, ${PEOPLE_SCORE} as score
       from people p
      where ${PEOPLE_MATCH}
      order by score desc, p.name_en
      limit ${Number(limit) || 20}`, params);
}

/** Every ID or old register number that contains the text, grouped by what it points to. */
export async function searchNumbers(term) {
  const raw = String(term || '').trim();
  if (raw.length < 2) return { codes: [], memberships: [], receipts: [], vouchers: [], deposits: [], exact: [] };
  const like = likeParam(raw);
  const hasDigit = /\d/.test(raw);
  const none = Promise.resolve([]);

  const [codes, memberships, receipts, vouchers, deposits] = await Promise.all([
    q(`select code, kind, record_table, record_id, (lower(code) = lower($1)) as exact
         from entity_codes where code ilike $2
        order by (lower(code) = lower($1)) desc, similarity(code, $1) desc limit 12`, [raw, like]),
    hasDigit ? q(
      `select n.number_as_written, n.is_current, m.id as membership_id, m.code, m.tier, m.status, p.id as person_id, p.name_en, p.name_mr,
              (lower(n.number_as_written) = lower($1)) as exact
         from membership_numbers n join memberships m on m.id = n.membership_id join people p on p.id = m.person_id
        where n.number_as_written ilike $2 and m.deleted_at is null
        order by (lower(n.number_as_written) = lower($1)) desc, n.number_as_written limit 12`, [raw, like]) : none,
    hasDigit ? q(
      `select r.id, r.code, r.number_as_written, r.fy, r.receipt_date, r.is_cancelled, i.id as income_id, i.amount, i.payer_as_written,
              (lower(r.number_as_written) = lower($1)) as exact
         from receipts r left join income_entries i on i.receipt_id = r.id and i.deleted_at is null
        where r.number_as_written ilike $2 and r.deleted_at is null
        order by (lower(r.number_as_written) = lower($1)) desc, r.receipt_date desc nulls last limit 12`, [raw, like]) : none,
    hasDigit ? q(
      `select e.id, e.code, e.voucher_no_as_written, e.entry_date, e.amount, e.payee_as_written, e.fy,
              (lower(e.voucher_no_as_written) = lower($1)) as exact
         from expenses e where e.voucher_no_as_written ilike $2 and e.deleted_at is null
        order by (lower(e.voucher_no_as_written) = lower($1)) desc, e.entry_date desc nulls last limit 12`, [raw, like]) : none,
    hasDigit ? q(
      `select f.id, f.code, f.fd_number, f.bank, f.principal, f.maturity_date, f.status,
              (lower(f.fd_number) = lower($1)) as exact
         from fixed_deposits f where f.fd_number ilike $2 and f.deleted_at is null
        order by (lower(f.fd_number) = lower($1)) desc, f.maturity_date desc nulls last limit 12`, [raw, like]) : none,
  ]);

  // Places an exact hit would open, so that typing a full ID goes straight to the record.
  const exact = [
    ...codes.filter((c) => c.exact).map((c) => ({ table: c.record_table, id: c.record_id })),
    ...memberships.filter((m) => m.exact).map((m) => ({ table: 'people', id: m.person_id })),
    ...receipts.filter((r) => r.exact && r.income_id).map((r) => ({ table: 'income_entries', id: r.income_id })),
    ...vouchers.filter((v) => v.exact).map((v) => ({ table: 'expenses', id: v.id })),
    ...deposits.filter((d) => d.exact).map((d) => ({ table: 'fixed_deposits', id: d.id })),
  ];
  return { codes, memberships, receipts, vouchers, deposits, exact };
}
