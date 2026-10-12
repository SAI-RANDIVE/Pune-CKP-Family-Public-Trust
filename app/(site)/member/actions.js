'use server';

import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getPool } from '../../../lib/db';
import { issueCode } from '../../../lib/ids';
import { rateLimit } from '../../../lib/rateLimit';
import { isEmailConfigured, sendNoticeEmail } from '../../../lib/email';
import { getSiteUrl } from '../../../lib/seo';
import { bumpLive } from '../../../lib/tms/live';
import {
  MEMBER_COOKIE, getCurrentMember, issueMemberCredentials, memberCookieOptions, memberLogin, memberLogout,
  memberPasswordProblem, setMemberPassword, verifyPassword,
} from '../../../lib/memberAuth';

/**
 * Everything a member can do in the members' corner: sign in and out, choose
 * a password, ask for a new one, and register for (or withdraw from) an event.
 * Each action checks the member's own session; a member can only ever act on
 * their own record.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ip = () => (headers().get('x-forwarded-for') || '').split(',')[0].trim() || headers().get('x-real-ip') || 'unknown';

export async function memberSignIn(formData) {
  const identifier = String(formData.get('identifier') || '').slice(0, 254);
  const password = String(formData.get('password') || '').slice(0, 200);

  let result;
  try {
    const limit = await rateLimit({ key: `member:login:${ip()}`, limit: 12, windowSeconds: 900 });
    if (!limit.ok) result = { ok: false, error: 'rate', minutes: Math.ceil(limit.retryAfterSeconds / 60) };
    else result = await memberLogin({ identifier, password });
  } catch (err) {
    console.error('[member] sign-in failed:', err?.message);
    result = { ok: false, error: 'server' };
  }
  if (!result.ok) redirect(`/member/login?e=${result.error}${result.minutes ? `&m=${result.minutes}` : ''}`);

  cookies().set(MEMBER_COOKIE, result.token, memberCookieOptions(result.expiresAt));
  redirect(result.mustChange ? '/member/password?first=1' : '/member');
}

export async function memberSignOut() {
  await memberLogout().catch(() => {});
  cookies().delete(MEMBER_COOKIE);
  redirect('/member/login?e=signed_out');
}

export async function changeMemberPassword(formData) {
  const member = await getCurrentMember();
  if (!member) redirect('/member/login');
  const first = formData.get('first') === '1';
  const back = `/member/password${first ? '?first=1&' : '?'}`;
  const current = String(formData.get('current') || '');
  const next = String(formData.get('next') || '');
  const again = String(formData.get('again') || '');

  const limit = await rateLimit({ key: `member:pw:${member.account_id}`, limit: 8, windowSeconds: 900 });
  if (!limit.ok) redirect(`${back}e=rate`);

  const { rows } = await getPool().query('select password_hash from member_accounts where id = $1', [member.account_id]);
  if (!rows.length || !verifyPassword(current, rows[0].password_hash)) redirect(`${back}e=current`);
  if (next !== again) redirect(`${back}e=match`);
  if (next === current) redirect(`${back}e=same`);
  if (memberPasswordProblem(next)) redirect(`${back}e=weak`);

  await setMemberPassword(member.account_id, next, member.session_id);
  redirect('/member?ok=password');
}

/**
 * "I forgot my password": e-mails a new one-time password to the address the
 * trust holds. Always answers the same way, whether or not the ID exists, so
 * the form cannot be used to find out who is a member.
 */
export async function requestMemberPassword(formData) {
  const identifier = String(formData.get('identifier') || '').trim().slice(0, 254);
  const done = '/member/login?e=reset_sent';
  if (identifier.length < 3) redirect('/member/login?forgot=1&e=reset_need');

  try {
    const byIp = await rateLimit({ key: `member:reset:${ip()}`, limit: 5, windowSeconds: 3600 });
    if (!byIp.ok || !isEmailConfigured()) redirect(done);

    const pool = getPool();
    const key = identifier.replace(/\s+/g, '').toUpperCase();
    const { rows } = await pool.query(
      `select p.id, p.code, p.name_en, p.name_mr, p.email
         from people p join member_accounts a on a.person_id = p.id
        where p.deleted_at is null and a.is_active and p.email is not null and p.email <> ''
          and (lower(p.email) = lower($1) or upper(replace(p.code, ' ', '')) = $2
               or exists (select 1 from memberships m where m.person_id = p.id and upper(replace(m.code, ' ', '')) = $2))
        limit 2`, [identifier, key]);
    if (rows.length === 1) {
      const person = rows[0];
      const perPerson = await rateLimit({ key: `member:reset:p:${person.id}`, limit: 3, windowSeconds: 86400 });
      if (perPerson.ok) {
        const { password } = await issueMemberCredentials(person.id);
        await sendNoticeEmail({
          to: person.email,
          subject: 'A new password for the Pune CKP Family Public Trust members\' corner',
          heading: 'Your new one-time password',
          greeting: `Namaskar ${person.name_en || person.name_mr || ''},`,
          paragraphs: ['Someone asked for a new password for your member login. Sign in with the one-time password below; you will be asked to choose your own.'],
          facts: [['Your trust ID', person.code, { mono: true }], ['One-time password', password, { mono: true }]],
          button: { href: `${getSiteUrl()}/member/login`, label: 'Open the members\' corner' },
          closing: 'If you did not ask for this, sign in with the password above and choose a new one, or tell the trust.',
        });
        await pool.query('update member_accounts set credentials_sent_at = now() where person_id = $1', [person.id]);
      }
    }
  } catch (err) {
    if (err?.digest?.startsWith?.('NEXT_REDIRECT')) throw err;
    console.error('[member] password reset failed:', err?.message);
  }
  redirect(done);
}

/** Registers the signed-in member (and guests) for an event. One registration per member per event. */
export async function registerForEvent(formData) {
  const member = await getCurrentMember();
  if (!member) redirect('/member/login');
  if (member.must_change_password) redirect('/member/password?first=1');
  const eventId = String(formData.get('event_id') || '');
  const guests = Math.min(20, Math.max(0, Number.parseInt(formData.get('guests'), 10) || 0));
  if (!UUID.test(eventId)) redirect('/member/events?e=missing');

  const client = await getPool().connect();
  let outcome = 'ok';
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `select id, fy, fee, capacity, registration_open, registration_closes_on, is_published from events
        where id = $1 and deleted_at is null for update`, [eventId]);
    const event = rows[0];
    const today = new Date().toISOString().slice(0, 10);
    if (!event || !event.is_published) outcome = 'missing';
    else if (!event.registration_open || (event.registration_closes_on && new Date(event.registration_closes_on).toISOString().slice(0, 10) < today)) outcome = 'closed';
    else {
      const existing = await client.query(
        "select id from event_registrations where event_id = $1 and person_id = $2 and status <> 'cancelled'", [eventId, member.person_id]);
      if (existing.rows.length) outcome = 'already';
      else {
        const taken = await client.query(
          "select coalesce(sum(1 + guests), 0)::int as n from event_registrations where event_id = $1 and status <> 'cancelled'", [eventId]);
        if (event.capacity && taken.rows[0].n + 1 + guests > event.capacity) outcome = taken.rows[0].n >= event.capacity ? 'full' : 'too_many';
        else {
          const id = crypto.randomUUID();
          const code = await issueCode(client, 'event_registrations', { id, fy: event.fy });
          const due = Number(event.fee) * (1 + guests);
          await client.query(
            `insert into event_registrations (id, code, event_id, person_id, name, phone, email, guests, amount_due, payment_status, source)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'member')`,
            [id, code, eventId, member.person_id, member.name_en || member.name_mr, member.phone, member.email, guests, due, due > 0 ? 'pending' : 'not_required']);
        }
      }
    }
    await client.query(outcome === 'ok' ? 'commit' : 'rollback');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error('[member] registration failed:', err?.message);
    // The unique index is the last line of defence against a double press.
    outcome = err?.code === '23505' ? 'already' : 'server';
  } finally {
    client.release();
  }
  if (outcome === 'ok') {
    await bumpLive('events');
    revalidatePath('/member/events');
  }
  redirect(`/member/events?${outcome === 'ok' ? 'ok=registered' : `e=${outcome}`}#event-${eventId}`);
}

export async function cancelRegistration(formData) {
  const member = await getCurrentMember();
  if (!member) redirect('/member/login');
  const eventId = String(formData.get('event_id') || '');
  if (!UUID.test(eventId)) redirect('/member/events?e=missing');
  try {
    await getPool().query(
      `update event_registrations set status = 'cancelled', updated_at = now()
        where event_id = $1 and person_id = $2 and status = 'registered'`, [eventId, member.person_id]);
    await bumpLive('events');
  } catch (err) {
    console.error('[member] cancel failed:', err?.message);
    redirect('/member/events?e=server');
  }
  redirect(`/member/events?ok=cancelled#event-${eventId}`);
}
