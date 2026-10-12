import crypto from 'crypto';
import { getPool } from './db';
import { findMembershipById } from './register';
import { isEmailConfigured, sendNoticeEmail } from './email';

/**
 * Family groups. A member adds a relative by that person's trust ID or
 * membership ID. Because the ID alone proves nothing, the link starts as
 * "pending" and a six-digit code goes to the RELATIVE's e-mail address; the
 * link counts only once that code is typed in (so the relative has agreed), or
 * once a trustee confirms it at the trust desk.
 *
 * One row per pair of people. It is stored from the point of view of whoever
 * created it ("B is A's child") and read from either side.
 */

export const RELATIONS = ['spouse', 'child', 'parent', 'sibling', 'other'];
const INVERSE = { spouse: 'spouse', child: 'parent', parent: 'child', sibling: 'sibling', other: 'other' };
export const RELATION_LABEL = { spouse: 'Spouse', child: 'Son / daughter', parent: 'Parent', sibling: 'Brother / sister', other: 'Family member' };

const CODE_MINUTES = 30;
const MAX_ATTEMPTS = 5;
const MAX_FAMILY = 12;

const hashCode = (code, linkId) => crypto.createHash('sha256').update(`${process.env.OTP_PEPPER || ''}:${linkId}:${code}`).digest('hex');

/** Everyone linked to a person, each with the relation as seen from that person. */
export async function listFamily(personId, db = getPool()) {
  const { rows } = await db.query(
    `select l.id, l.status, l.relation, l.person_id, l.relative_id, l.created_at, l.confirmed_at, l.confirmed_by,
            p.id as other_id, p.code as other_code, p.name_en, p.name_mr, p.phone, p.email, p.date_of_birth,
            (select m.code from memberships m where m.person_id = p.id and m.deleted_at is null
              order by (m.status = 'active') desc, m.expiry_date desc nulls first limit 1) as membership_code,
            (select m.tier || ' · ' || m.status from memberships m where m.person_id = p.id and m.deleted_at is null
              order by (m.status = 'active') desc, m.expiry_date desc nulls first limit 1) as membership,
            exists (select 1 from person_photos ph where ph.person_id = p.id) as has_photo
       from family_links l
       join people p on p.id = case when l.person_id = $1 then l.relative_id else l.person_id end
      where (l.person_id = $1 or l.relative_id = $1) and p.deleted_at is null
      order by (l.status = 'confirmed') desc, l.created_at`, [personId]);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    // Stored as "relative is person's <relation>": flip it when read from the relative's side.
    relation: r.person_id === personId ? r.relation : INVERSE[r.relation],
    startedByMe: r.person_id === personId,
    confirmedBy: r.confirmed_by,
    person: {
      id: r.other_id, code: r.other_code, name: r.name_en || r.name_mr, nameMr: r.name_mr, phone: r.phone, email: r.email,
      dateOfBirth: r.date_of_birth, membershipCode: r.membership_code, membership: r.membership, hasPhoto: r.has_photo,
    },
  }));
}

/** True when the two people are in the same confirmed family. */
export async function areFamily(a, b, db = getPool()) {
  if (a === b) return true;
  const { rows } = await db.query(
    `select 1 from family_links where status = 'confirmed'
        and least(person_id, relative_id) = least($1::uuid, $2::uuid) and greatest(person_id, relative_id) = greatest($1::uuid, $2::uuid)`, [a, b]);
  return rows.length > 0;
}

async function findPerson(idText, db) {
  const found = await findMembershipById(idText, db);
  if (found) return found.person;
  const { rows } = await db.query(
    `select id, code, coalesce(name_en, name_mr) as name, email from people
      where deleted_at is null and merged_into_id is null and upper(replace(code, ' ', '')) = upper(replace($1, ' ', '')) limit 1`, [String(idText || '').trim()]);
  return rows[0] || null;
}

/**
 * A member asks to add a relative. Returns { ok, linkId, sentTo } or { ok: false, error }.
 * error: 'not_found' | 'self' | 'exists' | 'no_email' | 'too_many' | 'mail'
 */
export async function requestFamilyLink({ personId, personName, relativeIdText, relation }) {
  if (!RELATIONS.includes(relation)) return { ok: false, error: 'relation' };
  const pool = getPool();
  const relative = await findPerson(relativeIdText, pool);
  if (!relative) return { ok: false, error: 'not_found' };
  if (relative.id === personId) return { ok: false, error: 'self' };
  if (!relative.email) return { ok: false, error: 'no_email' };
  if (!isEmailConfigured()) return { ok: false, error: 'mail' };

  const existing = await pool.query(
    `select id, status from family_links
      where least(person_id, relative_id) = least($1::uuid, $2::uuid) and greatest(person_id, relative_id) = greatest($1::uuid, $2::uuid)`,
    [personId, relative.id]);
  if (existing.rows[0]?.status === 'confirmed') return { ok: false, error: 'exists' };
  const count = await pool.query('select count(*)::int as n from family_links where person_id = $1 or relative_id = $1', [personId]);
  if (!existing.rows.length && count.rows[0].n >= MAX_FAMILY) return { ok: false, error: 'too_many' };

  const code = String(crypto.randomInt(100000, 1000000));
  let linkId = existing.rows[0]?.id;
  if (linkId) {
    await pool.query(
      `update family_links set person_id = $2, relative_id = $3, relation = $4, code_hash = $5,
              code_expires = now() + ($6 || ' minutes')::interval, attempts = 0 where id = $1`,
      [linkId, personId, relative.id, relation, hashCode(code, linkId), String(CODE_MINUTES)]);
  } else {
    linkId = crypto.randomUUID();
    await pool.query(
      `insert into family_links (id, person_id, relative_id, relation, code_hash, code_expires)
       values ($1,$2,$3,$4,$5, now() + ($6 || ' minutes')::interval)`,
      [linkId, personId, relative.id, relation, hashCode(code, linkId), String(CODE_MINUTES)]);
  }

  try {
    await sendNoticeEmail({
      to: relative.email,
      subject: `${personName} wants to add you to their family at Pune CKP Family Public Trust`,
      heading: 'A family request needs your approval',
      greeting: `Namaskar ${relative.name || ''},`,
      paragraphs: [
        `${personName} has asked to add you to their family group in the trust's members' corner, as their ${RELATION_LABEL[relation].toLowerCase()}.`,
        'If this is right, give them the code below. They type it in, and your two records are linked as one family. Family members can see each other\'s name, membership and validity; nothing else is shared.',
      ],
      facts: [['Approval code', code, { mono: true }], ['Valid for', `${CODE_MINUTES} minutes`]],
      closing: 'If you do not know this person, or the request is wrong, simply ignore this message. Nothing is linked without the code.',
    });
  } catch (err) {
    console.error('[family] code e-mail failed:', err?.message);
    return { ok: false, error: 'mail' };
  }
  const [user, domain] = relative.email.split('@');
  return { ok: true, linkId, sentTo: `${user.slice(0, 2)}${'*'.repeat(Math.max(2, user.length - 2))}@${domain}` };
}

/** The member types the code the relative received. error: 'not_found' | 'expired' | 'wrong' | 'locked' */
export async function confirmFamilyLink({ personId, linkId, code }) {
  const pool = getPool();
  const { rows } = await pool.query("select * from family_links where id = $1 and person_id = $2 and status = 'pending'", [linkId, personId]);
  const link = rows[0];
  if (!link) return { ok: false, error: 'not_found' };
  if (link.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'locked' };
  if (!link.code_expires || new Date(link.code_expires) < new Date()) return { ok: false, error: 'expired' };
  const given = hashCode(String(code || '').replace(/\D/g, ''), link.id);
  const good = link.code_hash && given.length === link.code_hash.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(link.code_hash));
  if (!good) {
    await pool.query('update family_links set attempts = attempts + 1 where id = $1', [link.id]);
    return { ok: false, error: link.attempts + 1 >= MAX_ATTEMPTS ? 'locked' : 'wrong' };
  }
  await pool.query(
    "update family_links set status = 'confirmed', confirmed_by = 'code', confirmed_at = now(), code_hash = null, code_expires = null where id = $1", [link.id]);
  return { ok: true };
}

/** Either side may leave a family link. */
export async function removeFamilyLink({ personId, linkId }) {
  const { rowCount } = await getPool().query('delete from family_links where id = $1 and (person_id = $2 or relative_id = $2)', [linkId, personId]);
  return rowCount > 0;
}
