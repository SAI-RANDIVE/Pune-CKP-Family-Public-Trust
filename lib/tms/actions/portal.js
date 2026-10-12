'use server';

import { redirect } from 'next/navigation';
import { writeAudit } from '../../adminAuth';
import { describeMailError, isEmailConfigured, sendNoticeEmail } from '../../email';
import { issueMemberCredentials } from '../../memberAuth';
import { memberStatementPdf } from '../../memberPdf';
import { getSiteUrl } from '../../seo';
import { getPool } from '../../db';
import { isUuid, one, q } from '../db';
import { audit, clientIp } from '../auth';
import { guardForm, refreshAll, withParam } from '../actionKit';

/**
 * The members' corner, from the trust's side: creating a member's login and
 * e-mailing it to them, switching a login off, and sending a member their
 * statement as a PDF. A password is never shown to a trustee: it goes only to
 * the member's own e-mail address.
 */

const BATCH = 40; // per press of the button: stays well inside Gmail's daily limit and a request's time limit

const backFor = (formData) => {
  const back = String(formData.get('back') || '');
  return /^\/(people\/[0-9a-f-]{36}|portal)(\?.*)?$/.test(back) ? back.split('?')[0] : '/portal';
};

async function loadPerson(id) {
  return one(
    `select p.id, p.code, p.name_en, p.name_mr, p.email,
            (select m.code from memberships m where m.person_id = p.id and m.deleted_at is null
              order by (m.status = 'active') desc, m.expiry_date desc nulls first limit 1) as membership_code
       from people p where p.id = $1 and p.deleted_at is null and p.merged_into_id is null`, [id]);
}

async function mailCredentials(person) {
  const { password } = await issueMemberCredentials(person.id);
  const loginUrl = `${getSiteUrl()}/member/login`;
  try {
    await sendNoticeEmail({
      to: person.email,
      subject: 'Your login for the Pune CKP Family Public Trust members\' corner',
      heading: 'Your member login is ready',
      greeting: `Namaskar ${person.name_en || person.name_mr || ''},`,
      paragraphs: [
        'The trust has opened a members\' corner on its website. There you can see your membership and its validity, every payment the trust has on record from you, download your statement, and register for the trust\'s events.',
        'Sign in with the ID and the one-time password below. You will be asked to choose your own password the first time.',
      ],
      facts: [
        ['Your trust ID', person.code, { mono: true }],
        ['Membership ID', person.membership_code, { mono: true }],
        ['One-time password', password, { mono: true }],
      ],
      button: { href: loginUrl, label: 'Open the members\' corner' },
      closing: 'You can sign in with either ID above, or with this e-mail address. If you did not expect this message, please ignore it or tell the trust.',
    });
  } catch (err) {
    // The password that was just set never reached anyone: switch the login off again rather than leave it live.
    await getPool().query('update member_accounts set is_active = false where person_id = $1 and credentials_sent_at is null', [person.id]).catch(() => {});
    throw err;
  }
  await getPool().query('update member_accounts set credentials_sent_at = now(), is_active = true where person_id = $1', [person.id]);
}

/** Creates (or resets) one member's login and e-mails it to them. */
export async function sendMemberLogin(formData) {
  const back = backFor(formData);
  const admin = await guardForm('admin', { back });
  const id = String(formData.get('person_id') || '');
  if (!isUuid(id)) redirect(withParam(back, 'err', 'not_found'));
  const person = await loadPerson(id);
  if (!person) redirect(withParam(back, 'err', 'not_found'));
  if (!person.email) redirect(withParam(back, 'err', 'no_email'));
  if (!isEmailConfigured()) redirect(withParam(back, 'err', 'mail'));

  let failed = false;
  try {
    await mailCredentials(person);
  } catch (err) {
    console.error('[TMS] member login e-mail failed:', describeMailError(err));
    failed = true;
  }
  await audit(admin, {
    action: failed ? 'member_login_email_failed' : 'member_login_sent', entity: 'people', entityId: id, detail: { to: person.email },
  });
  refreshAll();
  redirect(withParam(back, failed ? 'err' : 'ok', failed ? 'mail' : 'login_sent'));
}

/**
 * Sends logins to members who have an e-mail address and have never been sent
 * one, a batch at a time. Super Admin + e-mailed code, because it writes to
 * many people at once.
 */
export async function sendMemberLoginsBatch() {
  const admin = await guardForm('super_admin', { otp: true, back: '/portal' });
  if (!isEmailConfigured()) redirect('/portal?err=mail');
  const people = await q(
    `select p.id, p.code, p.name_en, p.name_mr, p.email,
            (select m.code from memberships m where m.person_id = p.id and m.deleted_at is null
              order by (m.status = 'active') desc, m.expiry_date desc nulls first limit 1) as membership_code
       from people p
      where p.deleted_at is null and p.merged_into_id is null and p.email is not null and p.email <> ''
        and exists (select 1 from memberships m where m.person_id = p.id and m.deleted_at is null and m.status in ('active', 'lapsed'))
        and not exists (select 1 from member_accounts a where a.person_id = p.id and a.credentials_sent_at is not null)
      order by p.code limit ${BATCH}`);

  let sent = 0;
  let failed = 0;
  for (const person of people) {
    try {
      await mailCredentials(person);
      sent += 1;
    } catch (err) {
      console.error('[TMS] member login e-mail failed:', person.code, describeMailError(err));
      failed += 1;
      if (failed >= 3 && sent === 0) break; // the mail server is refusing: stop instead of burning through the list
    }
  }
  await writeAudit({
    adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
    action: 'member_logins_batch_sent', entity: 'member_accounts', detail: { sent, failed, considered: people.length },
  });
  refreshAll();
  redirect(`/portal?ok=batch_sent&sent=${sent}&failed=${failed}`);
}

/** Switches a member's login off (they can no longer sign in) or back on. */
export async function setMemberLoginActive(formData) {
  const back = backFor(formData);
  const admin = await guardForm('admin', { back });
  const id = String(formData.get('person_id') || '');
  const active = formData.get('active') === 'true';
  if (!isUuid(id)) redirect(withParam(back, 'err', 'not_found'));
  const pool = getPool();
  const { rows } = await pool.query('update member_accounts set is_active = $2, updated_at = now() where person_id = $1 returning id', [id, active]);
  if (!rows.length) redirect(withParam(back, 'err', 'not_found'));
  if (!active) await pool.query('delete from member_sessions where account_id = $1', [rows[0].id]);
  await audit(admin, { action: active ? 'member_login_enabled' : 'member_login_disabled', entity: 'people', entityId: id });
  refreshAll();
  redirect(withParam(back, 'ok', 'updated'));
}

/** E-mails a member their statement (memberships and every payment on record) as a PDF. */
export async function emailMemberStatement(formData) {
  const back = backFor(formData);
  const admin = await guardForm('accountant', { back });
  const id = String(formData.get('person_id') || '');
  if (!isUuid(id)) redirect(withParam(back, 'err', 'not_found'));
  const person = await loadPerson(id);
  if (!person) redirect(withParam(back, 'err', 'not_found'));
  if (!person.email) redirect(withParam(back, 'err', 'no_email'));
  if (!isEmailConfigured()) redirect(withParam(back, 'err', 'mail'));

  let failed = false;
  try {
    const statement = await memberStatementPdf(id);
    await sendNoticeEmail({
      to: person.email,
      subject: `Your member statement from Pune CKP Family Public Trust (${person.code})`,
      heading: 'Your member statement',
      greeting: `Namaskar ${person.name_en || person.name_mr || ''},`,
      paragraphs: [
        'Attached is your statement from the trust\'s records: your trust ID, your memberships and their validity, and every payment the trust has received from you.',
        'If anything is missing or needs correcting, please reply to this e-mail or tell any trustee.',
      ],
      facts: [['Trust ID', person.code, { mono: true }], ['Membership ID', person.membership_code, { mono: true }]],
      attachments: [{ filename: statement.fileName, content: statement.buffer, contentType: 'application/pdf' }],
    });
  } catch (err) {
    console.error('[TMS] member statement e-mail failed:', describeMailError(err));
    failed = true;
  }
  await audit(admin, {
    action: failed ? 'member_statement_email_failed' : 'member_statement_emailed', entity: 'people', entityId: id, detail: { to: person.email },
  });
  redirect(withParam(back, failed ? 'err' : 'ok', failed ? 'mail' : 'statement_sent'));
}
