'use server';

import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getPool } from '../../../lib/db';
import { issueCode } from '../../../lib/ids';
import { rateLimit } from '../../../lib/rateLimit';
import { getCurrentMember } from '../../../lib/memberAuth';
import { confirmFamilyLink, removeFamilyLink, requestFamilyLink } from '../../../lib/family';
import { bumpLive } from '../../../lib/tms/live';

/**
 * The members' corner, part two: family groups, polls, and suggestions.
 * (Sign-in, passwords and event registration are in actions.js.)
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ip = () => (headers().get('x-forwarded-for') || '').split(',')[0].trim() || headers().get('x-real-ip') || 'unknown';

async function requireMember() {
  const member = await getCurrentMember();
  if (!member) redirect('/member/login');
  if (member.must_change_password) redirect('/member/password?first=1');
  return member;
}

/* ------------------------------------------------------------------ family */

export async function addFamilyMember(formData) {
  const member = await requireMember();
  const idText = String(formData.get('relative_id') || '').trim().slice(0, 40);
  const relation = String(formData.get('relation') || '');
  if (idText.length < 3) redirect('/member/family?e=need_id');

  const limit = await rateLimit({ key: `family:add:${member.person_id}`, limit: 8, windowSeconds: 3600 });
  if (!limit.ok) redirect('/member/family?e=rate');

  const result = await requestFamilyLink({
    personId: member.person_id, personName: member.name_en || member.name_mr, relativeIdText: idText, relation,
  });
  if (!result.ok) redirect(`/member/family?e=${result.error}`);
  redirect(`/member/family?ok=code_sent&to=${encodeURIComponent(result.sentTo)}#link-${result.linkId}`);
}

export async function confirmFamilyMember(formData) {
  const member = await requireMember();
  const linkId = String(formData.get('link_id') || '');
  if (!UUID.test(linkId)) redirect('/member/family?e=not_found');
  const result = await confirmFamilyLink({ personId: member.person_id, linkId, code: formData.get('code') });
  redirect(result.ok ? '/member/family?ok=linked' : `/member/family?e=${result.error}#link-${linkId}`);
}

export async function removeFamilyMember(formData) {
  const member = await requireMember();
  const linkId = String(formData.get('link_id') || '');
  if (UUID.test(linkId)) await removeFamilyLink({ personId: member.person_id, linkId });
  redirect('/member/family?ok=removed');
}

/* ------------------------------------------------------------------- polls */

/** One vote per member per poll, only while the poll is open. A vote cannot be changed. */
export async function castVote(formData) {
  const member = await requireMember();
  const pollId = String(formData.get('poll_id') || '');
  const option = Number.parseInt(formData.get('option'), 10);
  if (!UUID.test(pollId) || !Number.isInteger(option)) redirect('/member/polls?e=choose');

  const pool = getPool();
  let outcome = 'voted';
  try {
    const { rows } = await pool.query(
      `select jsonb_array_length(options) as n, (now() between opens_at and closes_at) as open
         from polls where id = $1 and is_published and deleted_at is null`, [pollId]);
    if (!rows.length) outcome = 'missing';
    else if (!rows[0].open) outcome = 'closed';
    else if (option < 0 || option >= rows[0].n) outcome = 'choose';
    else {
      const res = await pool.query(
        'insert into poll_votes (poll_id, person_id, option_index) values ($1,$2,$3) on conflict do nothing', [pollId, member.person_id, option]);
      if (!res.rowCount) outcome = 'already';
    }
  } catch (err) {
    console.error('[member] vote failed:', err?.message);
    outcome = 'server';
  }
  if (outcome === 'voted') await bumpLive('polls');
  redirect(`/member/polls?${outcome === 'voted' ? 'ok=voted' : `e=${outcome}`}#poll-${pollId}`);
}

/* ---------------------------------------------------------------- feedback */

const KINDS = ['suggestion', 'feedback', 'complaint', 'appreciation'];

/** A suggestion or feedback, from a signed-in member or any visitor. Rate-limited; a hidden field catches simple bots. */
export async function sendFeedback(formData) {
  const back = formData.get('from') === 'member' ? '/member/feedback' : '/feedback';
  if (String(formData.get('website') || '').trim()) redirect(`${back}?ok=sent`); // honeypot: a person never fills this
  const kind = KINDS.includes(String(formData.get('kind'))) ? String(formData.get('kind')) : 'suggestion';
  const message = String(formData.get('message') || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 3000);
  const name = String(formData.get('name') || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  const contact = String(formData.get('contact') || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 160);
  if (message.length < 10) redirect(`${back}?e=short`);

  let outcome = 'sent';
  try {
    const limit = await rateLimit({ key: `feedback:${ip()}`, limit: 5, windowSeconds: 3600 });
    if (!limit.ok) outcome = 'rate';
    else {
      const member = await getCurrentMember().catch(() => null);
      const client = await getPool().connect();
      try {
        await client.query('begin');
        const id = crypto.randomUUID();
        const code = await issueCode(client, 'feedback', { id, date: new Date() });
        await client.query(
          'insert into feedback (id, code, kind, person_id, name, contact, message) values ($1,$2,$3,$4,$5,$6,$7)',
          [id, code, kind, member?.person_id || null, member ? (member.name_en || member.name_mr) : (name || null), member ? (member.email || member.phone) : (contact || null), message]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error('[feedback] failed:', err?.message);
    outcome = 'server';
  }
  redirect(`${back}?${outcome === 'sent' ? 'ok=sent' : `e=${outcome}`}`);
}
