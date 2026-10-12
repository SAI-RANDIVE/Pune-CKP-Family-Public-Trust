import crypto from 'crypto';
import { getPool } from './db';
import { issueCode } from './ids';

/**
 * Bridge between the public website and the trust's member register (the
 * people / memberships tables that the management system keeps).
 *
 * The website used to know only the members who had signed up online. With
 * this, a member who joined years ago on paper can type the ID on their card,
 * new or old (SLV/MEM/0012, SM/24/173, PCFPT/PER/00045), and renew; nobody is
 * entered twice, and nobody pays twice for the same period.
 */

const last10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);
const squash = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** How long before the expiry date a renewal may be paid. */
export const RENEW_WINDOW_DAYS = 180;

const MEMBERSHIP_COLUMNS = `
  m.id as membership_id, m.code as membership_code, m.tier, m.status, m.start_date, m.expiry_date, m.legacy_member_id as membership_legacy_id,
  p.id as person_id, p.code as person_code, p.name_en, p.name_mr, p.email, p.phone, p.phone_alt, p.address, p.city, p.pincode,
  p.legacy_member_id as person_legacy_id`;

const shape = (r) => (r ? {
  membership: {
    id: r.membership_id, code: r.membership_code, tier: r.tier, status: r.status,
    startDate: iso(r.start_date), expiryDate: iso(r.expiry_date), legacyMemberId: r.membership_legacy_id,
  },
  person: {
    id: r.person_id, code: r.person_code, name: r.name_en || r.name_mr, email: r.email, phone: r.phone, phoneAlt: r.phone_alt,
    address: [r.address, r.city, r.pincode].filter(Boolean).join(', '), legacyMemberId: r.person_legacy_id,
  },
} : null);

// A person may hold several memberships over the years (Silver, later Gold).
// The one that counts is the live one, else the most recent.
const CURRENT_FIRST = `order by (m.status = 'active') desc, (m.status = 'lapsed') desc, m.expiry_date desc nulls first, m.start_date desc nulls last`;

/**
 * Finds a membership from whatever ID the member typed. Tries, in order: the
 * membership ID, an old register number, the person's trust ID, and the
 * number issued by the website.
 */
export async function findMembershipById(idText, db = getPool()) {
  const raw = String(idText || '').trim();
  if (raw.length < 3 || raw.length > 40) return null;
  const key = squash(raw);

  const attempts = [
    [`select ${MEMBERSHIP_COLUMNS} from memberships m join people p on p.id = m.person_id
       where m.deleted_at is null and p.deleted_at is null and upper(replace(m.code, ' ', '')) = $1 limit 1`],
    [`select ${MEMBERSHIP_COLUMNS} from membership_numbers n join memberships m on m.id = n.membership_id join people p on p.id = m.person_id
       where m.deleted_at is null and p.deleted_at is null and upper(replace(n.number_as_written, ' ', '')) = $1
       ${CURRENT_FIRST} limit 1`],
    [`select ${MEMBERSHIP_COLUMNS} from people p join memberships m on m.person_id = p.id
       where m.deleted_at is null and p.deleted_at is null and upper(replace(p.code, ' ', '')) = $1
       ${CURRENT_FIRST} limit 1`],
    [`select ${MEMBERSHIP_COLUMNS} from members w join memberships m on m.legacy_member_id = w.id join people p on p.id = m.person_id
       where m.deleted_at is null and p.deleted_at is null and upper(replace(w.membership_no, ' ', '')) = $1
       ${CURRENT_FIRST} limit 1`],
  ];
  for (const [sql] of attempts) {
    const { rows } = await db.query(sql, [key]);
    if (rows.length) return shape(rows[0]);
  }
  return null;
}

/** Memberships held by whoever owns this (OTP-verified) e-mail address. */
export async function findMembershipsByEmail(email, db = getPool()) {
  const { rows } = await db.query(
    `select ${MEMBERSHIP_COLUMNS} from people p join memberships m on m.person_id = p.id
      where m.deleted_at is null and p.deleted_at is null and p.merged_into_id is null
        and lower(p.email) = lower($1) and m.status in ('active', 'lapsed')
      ${CURRENT_FIRST}`, [String(email || '').trim()]);
  return rows.map(shape);
}

/** The payer proved an e-mail by code and typed a phone number: is this their membership? */
export function identityMatches(person, { email, phone }) {
  if (person.email && email && person.email.trim().toLowerCase() === String(email).trim().toLowerCase()) return true;
  const typed = last10(phone);
  if (typed.length === 10 && [person.phone, person.phoneAlt].some((p) => last10(p) === typed)) return true;
  return false;
}

/**
 * Why this membership cannot be renewed right now, or null when it can.
 * Returns { code, message }.
 */
export async function renewalBlock(found, db = getPool()) {
  const { membership } = found;
  const till = membership.expiryDate;
  const nice = till ? new Date(`${till}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;

  if (membership.tier === 'platinum') {
    return { code: 'lifetime', message: 'Platinum is a lifetime membership. There is nothing to renew.' };
  }
  if (!['silver', 'gold'].includes(membership.tier)) {
    return { code: 'tier', message: 'This membership cannot be renewed online. Please contact the trust.' };
  }
  if (['discontinued', 'converted'].includes(membership.status)) {
    return { code: 'closed', message: 'This membership is closed in the trust register. Please contact the trust, or join again as a new member.' };
  }
  if (till) {
    const daysLeft = Math.floor((new Date(`${till}T00:00:00Z`).getTime() - Date.now()) / 86400000);
    if (daysLeft > RENEW_WINDOW_DAYS) {
      return { code: 'early', message: `This membership is already valid until ${nice}. Renewal opens six months before that date, so nothing needs to be paid now.` };
    }
  }
  // A renewal paid moments ago (the page was refreshed, or two family members both paid).
  const legacyId = membership.legacyMemberId || found.person.legacyMemberId;
  if (legacyId) {
    const { rows } = await db.query(
      `select paid_at from payments
        where member_id = $1 and payment_kind = 'membership_renew' and status = 'paid' and paid_at > now() - interval '24 hours'
        order by paid_at desc limit 1`, [legacyId]);
    if (rows.length) {
      return { code: 'just_paid', message: 'A renewal for this membership was paid in the last 24 hours. Please check your e-mail for the receipt; if it has not arrived, contact the trust before paying again.' };
    }
  }
  return null;
}

/**
 * The checkout stores its payments against a row in `members` (the website's
 * own table). Makes sure a register membership has one, linked both ways.
 * Call inside a transaction.
 */
export async function ensureWebsiteMember(client, found) {
  const { membership, person } = found;
  const existing = membership.legacyMemberId || person.legacyMemberId;
  if (existing) {
    // The register is the source of truth for validity.
    await client.query('update members set valid_till = $2, membership_type = $3, updated_at = now() where id = $1',
      [existing, membership.expiryDate, membership.tier]);
    if (!membership.legacyMemberId) await client.query('update memberships set legacy_member_id = $2 where id = $1', [membership.id, existing]);
    return existing;
  }
  const { rows } = await client.query(
    `insert into members (full_name, phone, email, address, membership_type, membership_no, valid_from, valid_till, email_verified, notes)
     values ($1,$2,$3,$4,$5,$6,coalesce($7::date, current_date),$8,false,'Linked from the trust register for an online renewal')
     returning id`,
    [person.name, person.phone || '', person.email || '', person.address || '', membership.tier, membership.code,
      membership.startDate, membership.expiryDate]);
  const id = rows[0].id;
  await client.query('update memberships set legacy_member_id = $2 where id = $1', [membership.id, id]);
  await client.query('update people set legacy_member_id = $2 where id = $1 and legacy_member_id is null', [person.id, id]);
  return id;
}

/**
 * After a real payment succeeds, bring the register up to date: a renewal
 * moves the expiry date; a new sign-up becomes a person and a membership with
 * the trust's own IDs. Test-mode payments never touch the register.
 * Call inside the payment's transaction. Returns { membershipCode, personCode } or null.
 */
export async function syncPaidPayment(client, payment, websiteMemberId) {
  if (payment.is_test || !String(payment.payment_kind || '').startsWith('membership')) return null;

  if (payment.payment_kind === 'membership_renew') {
    const { rows } = await client.query(
      `update memberships set expiry_date = $2, status = 'active', updated_at = now()
        where id = (select id from memberships where legacy_member_id = $1 and deleted_at is null
                     order by (status = 'active') desc, expiry_date desc nulls last limit 1)
      returning code, person_id`, [websiteMemberId, payment.valid_till]);
    if (!rows.length) return null;
    const person = await client.query('select code from people where id = $1', [rows[0].person_id]);
    return { membershipCode: rows[0].code, personCode: person.rows[0]?.code || null };
  }

  // New member: reuse the person if the register already knows this e-mail or phone.
  const phone = last10(payment.payer_phone);
  const known = await client.query(
    `select id, code from people
      where deleted_at is null and merged_into_id is null
        and ((email is not null and lower(email) = lower($1)) or ($2 <> '' and right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $2))
      order by created_at limit 1`, [payment.payer_email || '', phone.length === 10 ? phone : '']);
  let personId = known.rows[0]?.id;
  let personCode = known.rows[0]?.code;
  if (!personId) {
    personId = crypto.randomUUID();
    personCode = await issueCode(client, 'people', { id: personId });
    await client.query(
      `insert into people (id, code, name_en, name_key, phone, email, address, roles, origin, legacy_member_id)
       values ($1, $2, $3, lower(regexp_replace($3, '[^a-zA-Z]+', ' ', 'g')), $4, $5, $6, array['member'], 'online', $7)`,
      [personId, personCode, payment.payer_name, payment.payer_phone, payment.payer_email, payment.payer_address, websiteMemberId]);
  } else {
    await client.query(
      `update people set legacy_member_id = coalesce(legacy_member_id, $2),
              roles = case when 'member' = any(roles) then roles else array_append(roles, 'member') end, updated_at = now()
        where id = $1`, [personId, websiteMemberId]);
  }
  const membershipId = crypto.randomUUID();
  const membershipCode = await issueCode(client, 'memberships', { id: membershipId, tier: payment.membership_type });
  await client.query(
    `insert into memberships (id, code, person_id, tier, start_date, expiry_date, status, origin, legacy_member_id)
     values ($1, $2, $3, $4, current_date, $5, 'active', 'online', $6)`,
    [membershipId, membershipCode, personId, payment.membership_type, payment.valid_till, websiteMemberId]);
  return { membershipCode, personCode };
}

/** "Suresh Ramchandra Pradhan" -> "S***** R********* P******": enough to recognise yourself, not enough to learn a name. */
export function maskName(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean)
    .map((w) => (w.length <= 1 ? w : `${w[0]}${'*'.repeat(Math.min(8, w.length - 1))}`)).join(' ');
}
