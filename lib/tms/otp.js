import { cookies } from 'next/headers';
import { createOtp, discardOtp, verifyOtp } from '../otp';
import { isEmailConfigured, sendMail, describeMailError } from '../email';
import { rateLimit } from '../rateLimit';
import { getPool } from '../db';
import { OTP_COOKIE, OTP_GRANT_MINUTES, audit, clientIp } from './auth';

/**
 * Step-up verification for sensitive actions (editing or deleting a money
 * record, exporting, changing roles, merging people, backup). A six-digit code
 * is e-mailed to the signed-in user's own address (lib/otp.js, purpose
 * 'admin_action', hashed with OTP_PEPPER). A correct code unlocks those
 * actions for OTP_GRANT_MINUTES in this browser only.
 */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Sends a code. Returns { ok } or { ok:false, error: 'rate' | 'mail' }. */
export async function sendAdminOtp(admin, actionRef = null) {
  const limit = await rateLimit({ key: `tms:otp:send:${admin.id}`, limit: 5, windowSeconds: 900 });
  if (!limit.ok) return { ok: false, error: 'rate' };

  const ip = clientIp();
  const { id, otp, minutes } = await createOtp(admin.email, { purpose: 'admin_action', ip });
  await getPool().query('update email_otps set admin_id = $1, action_ref = $2 where id = $3',
    [admin.id, actionRef ? String(actionRef).slice(0, 200) : null, id]);

  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      // Local development without SMTP: the code is shown in the server terminal only.
      console.log(`[TMS] verification code for ${admin.email}: ${otp}`);
      return { ok: true, dev: true };
    }
    await discardOtp(id);
    return { ok: false, error: 'mail' };
  }

  const trust = process.env.NEXT_PUBLIC_TRUST_NAME || 'Pune CKP Family Public Trust';
  try {
    await sendMail({
      to: admin.email,
      subject: `${otp} - पडताळणी कोड / verification code (${trust})`,
      text: `नमस्कार ${admin.name},\n\nविश्वस्त व्यवस्थापन प्रणालीतील महत्त्वाच्या कृतीसाठी आपला पडताळणी कोड: ${otp}\nहा कोड ${minutes} मिनिटांत संपेल आणि एकदाच वापरता येईल. हा कोड कोणालाही सांगू नका.\n\nYour verification code for a sensitive action in the Trust Management System is ${otp}.\nIt expires in ${minutes} minutes and works once. Do not share it with anyone.\n\nआपण ही विनंती केली नसल्यास, कृपया लगेच आपला पासवर्ड बदला.\nIf you did not ask for this, change your password at once.\n\n${trust}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.6;color:#1f1410;max-width:520px;margin:0 auto;padding:24px">
<p>नमस्कार ${esc(admin.name)},</p>
<p>विश्वस्त व्यवस्थापन प्रणालीतील महत्त्वाच्या कृतीसाठी आपला पडताळणी कोड:<br>Your verification code for a sensitive action:</p>
<p style="font-size:38px;font-weight:700;letter-spacing:10px;color:#7a1010;background:#fff6e6;border:2px dashed #b06d10;border-radius:12px;padding:16px;text-align:center;font-family:Consolas,monospace">${otp}</p>
<p>हा कोड ${minutes} मिनिटांत संपेल आणि एकदाच वापरता येईल. <strong>हा कोड कोणालाही सांगू नका.</strong><br>It expires in ${minutes} minutes and works once. <strong>Do not share it with anyone.</strong></p>
<p style="font-size:14px;color:#5b4a3f">आपण ही विनंती केली नसल्यास, कृपया लगेच आपला पासवर्ड बदला.<br>If you did not ask for this, change your password at once.</p>
<p style="font-size:14px;color:#5b4a3f">${esc(trust)}</p></div>`,
    });
  } catch (err) {
    console.error('TMS verification e-mail failed:', describeMailError(err));
    await discardOtp(id);
    return { ok: false, error: 'mail' };
  }
  await audit(admin, { action: 'otp_sent', detail: { for: actionRef } });
  return { ok: true };
}

/** Checks a code; on success sets the short-lived grant cookie. */
export async function confirmAdminOtp(admin, code) {
  const limit = await rateLimit({ key: `tms:otp:verify:${admin.id}`, limit: 12, windowSeconds: 900 });
  if (!limit.ok) return { ok: false, error: 'rate' };

  const result = await verifyOtp(admin.email, code, { purpose: 'admin_action' });
  if (!result.ok) {
    await audit(admin, { action: 'otp_failed' });
    return { ok: false, error: 'wrong' };
  }
  cookies().set(OTP_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: OTP_GRANT_MINUTES * 60,
  });
  await audit(admin, { action: 'otp_verified' });
  return { ok: true };
}
