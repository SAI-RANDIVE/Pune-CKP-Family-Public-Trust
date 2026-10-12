'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import {
  SESSION_COOKIE, extendSession, getCurrentAdmin, hashPassword, login, logout, pruneExpired,
  revokeSessions, sessionCookieOptions, verifyPassword,
} from '../../adminAuth';
import { getPool } from '../../db';
import { rateLimit } from '../../rateLimit';
import { LANG_COOKIE, normaliseLang } from '../i18n/index';
import { OTP_COOKIE, audit, clientIp, safeNext } from '../auth';
import { sendAdminOtp, confirmAdminOtp } from '../otp';
import { password as passwordRule } from '../schemas';
import { refreshAll } from '../actionKit';

const YEAR = 365 * 24 * 3600;

function setLangCookie(lang) {
  cookies().set(LANG_COOKIE, lang, { path: '/', maxAge: YEAR, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
}

export async function signIn(formData) {
  const identifier = String(formData.get('identifier') || '').slice(0, 254);
  const password = String(formData.get('password') || '').slice(0, 200);
  const ip = clientIp() || 'unknown';

  // Slows down password guessing from one address, on top of the per-account lockout.
  let limit = { ok: true };
  try {
    limit = await rateLimit({ key: `tms:login:${ip}`, limit: 12, windowSeconds: 900 });
  } catch (err) {
    console.error('[TMS] sign-in failed:', err?.message);
    redirect('/login?e=server');
  }
  if (!limit.ok) redirect(`/login?e=rate&m=${Math.ceil(limit.retryAfterSeconds / 60)}`);

  let result;
  try {
    result = await login({ identifier, password, ip, userAgent: headers().get('user-agent') });
  } catch (err) {
    console.error('[TMS] sign-in failed:', err?.message);
    redirect('/login?e=server');
  }
  if (!result.ok) redirect(`/login?e=${result.error}${result.minutes ? `&m=${result.minutes}` : ''}`);

  cookies().set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
  if (!cookies().get(LANG_COOKIE)) setLangCookie(normaliseLang(result.admin.preferred_lang));
  await pruneExpired().catch(() => {});
  redirect('/');
}

export async function signOut() {
  await logout().catch(() => {});
  cookies().delete(SESSION_COOKIE);
  cookies().delete(OTP_COOKIE);
  redirect('/login?e=signed_out');
}

/** One-tap language switch; remembered in a cookie and on the user's record. */
export async function setLang(formData) {
  const lang = normaliseLang(String(formData.get('lang') || ''));
  setLangCookie(lang);
  const admin = await getCurrentAdmin();
  if (admin) await getPool().query('update admin_users set preferred_lang = $1 where id = $2', [lang, admin.id]);
  refreshAll();
}

const SCALES = [100, 115, 130, 150];

/** A+ / A-: text size, remembered per user. */
export async function setScale(formData) {
  const admin = await getCurrentAdmin();
  if (!admin) return;
  const current = SCALES.includes(admin.text_scale) ? SCALES.indexOf(admin.text_scale) : 0;
  const direction = formData.get('dir') === 'down' ? -1 : 1;
  const next = SCALES[Math.min(SCALES.length - 1, Math.max(0, current + direction))];
  await getPool().query('update admin_users set text_scale = $1 where id = $2', [next, admin.id]);
  refreshAll();
}

/** "Stay signed in": returns the new expiry time (ISO) or null when the session is already gone. */
export async function stayIn() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const expiresAt = await extendSession();
  return expiresAt ? expiresAt.toISOString() : null;
}

export async function changePassword(formData) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const current = String(formData.get('current') || '');
  const next = String(formData.get('next') || '');
  const again = String(formData.get('again') || '');

  const limit = await rateLimit({ key: `tms:pw:${admin.id}`, limit: 6, windowSeconds: 900 });
  if (!limit.ok) redirect('/settings/account?err=rate');

  const { rows } = await getPool().query('select password_hash from admin_users where id = $1', [admin.id]);
  if (!rows.length || !verifyPassword(current, rows[0].password_hash)) redirect('/settings/account?err=password_current');
  if (next !== again) redirect('/settings/account?err=password_match');
  const rule = passwordRule.safeParse(next);
  if (!rule.success) redirect(`/settings/account?err=${rule.error.issues[0].message}`);

  await getPool().query('update admin_users set password_hash = $1 where id = $2', [hashPassword(next), admin.id]);
  await revokeSessions(admin.id, admin.session_id);
  await audit(admin, { action: 'password_changed', entity: 'admin_users', entityId: admin.id });
  redirect('/settings/account?ok=password');
}

/** Sends the six-digit code for a protected action. */
export async function sendCode(formData) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const next = safeNext(String(formData.get('next') || '/'));
  let result;
  try {
    result = await sendAdminOtp(admin, next);
  } catch (err) {
    console.error('[TMS] sending code failed:', err?.message);
    result = { ok: false, error: 'mail' };
  }
  const base = `/verify?next=${encodeURIComponent(next)}`;
  redirect(result.ok ? `${base}&sent=1` : `${base}&e=${result.error}`);
}

/** Checks the code and, when right, returns to the page that asked for it. */
export async function checkCode(formData) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const next = safeNext(String(formData.get('next') || '/'));
  const code = String(formData.get('code') || '').replace(/\D/g, '').slice(0, 6);
  let result;
  try {
    result = await confirmAdminOtp(admin, code);
  } catch (err) {
    console.error('[TMS] checking code failed:', err?.message);
    result = { ok: false, error: 'server' };
  }
  if (!result.ok) redirect(`/verify?next=${encodeURIComponent(next)}&sent=1&e=${result.error}`);
  redirect(next);
}
