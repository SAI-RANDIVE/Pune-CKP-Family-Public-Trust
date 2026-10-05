import crypto from 'crypto';
import * as React from 'react';
import { cookies } from 'next/headers';
import { getPool } from './db';

// React's per-request cache exists in the server build of React that Next.js
// uses; fall back to a plain call anywhere it does not.
const cache = typeof React.cache === 'function' ? React.cache : (fn) => fn;

/**
 * Sign-in for the Trust Management System: scrypt password hashing + opaque
 * session cookies.
 *
 * No JWT here on purpose — sessions live in Postgres so a login can be
 * revoked instantly, which a self-contained signed token can't give you.
 */

export const SESSION_COOKIE = 'ckp_admin_session';
export const SESSION_TTL_HOURS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, expected] = String(stored).split(':');
    if (scheme !== 'scrypt' || !salt || !expected) return false;
    const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(actual, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** Cookie options shared by sign-in and "stay signed in". */
export function sessionCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}

/**
 * Authenticates by e-mail address or username, applying lockout after repeated
 * failures. Errors are returned as codes (`error`) so the caller can show them
 * in the user's language; `minutes` accompanies the lock codes.
 */
export async function login({ identifier, email, password, ip = null, userAgent = null }) {
  const pool = getPool();
  const ident = String(identifier ?? email ?? '').trim().toLowerCase();

  const generic = { ok: false, error: 'invalid' };
  if (!ident || ident.length > 254) {
    crypto.scryptSync(String(password || ''), 'decoy-salt', 64);
    return generic;
  }

  const { rows } = await pool.query(
    'select * from admin_users where lower(email) = $1 or lower(username) = $1 order by (lower(email) = $1) desc limit 1',
    [ident]
  );
  const admin = rows[0];

  // Same answer and similar work either way, so this can't be used to
  // find out which logins exist.
  if (!admin || !admin.is_active) {
    crypto.scryptSync(String(password || ''), 'decoy-salt', 64);
    return generic;
  }

  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(admin.locked_until) - Date.now()) / 60000);
    return { ok: false, error: 'locked', minutes };
  }

  if (!verifyPassword(password, admin.password_hash)) {
    const attempts = admin.failed_attempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null;
    await pool.query('update admin_users set failed_attempts = $1, locked_until = $2 where id = $3', [lock ? 0 : attempts, lock, admin.id]);
    await writeAudit({ adminId: admin.id, adminEmail: admin.email, action: 'login_failed', ip });
    return lock ? { ok: false, error: 'locked_now', minutes: LOCKOUT_MINUTES } : generic;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  await pool.query(
    'insert into admin_sessions (admin_id, token_hash, expires_at, ip, user_agent) values ($1,$2,$3,$4,$5)',
    [admin.id, hashToken(token), expiresAt, ip, String(userAgent || '').slice(0, 300)]
  );
  await pool.query(
    'update admin_users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = $1',
    [admin.id]
  );
  await writeAudit({ adminId: admin.id, adminEmail: admin.email, action: 'login_success', ip });

  return {
    ok: true, token, expiresAt,
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, preferred_lang: admin.preferred_lang },
  };
}

/** Reads the session cookie and returns the signed-in user, or null. One query per request. */
export const getCurrentAdmin = cache(async () => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const { rows } = await getPool().query(
    `select a.id, a.email, a.username, a.name, a.role, a.preferred_lang, a.text_scale, a.person_id,
            s.id as session_id, s.expires_at
       from admin_sessions s
       join admin_users a on a.id = s.admin_id
      where s.token_hash = $1 and s.expires_at > now() and a.is_active = true`,
    [hashToken(token)]
  );
  return rows[0] || null;
});

/** Pushes the current session's expiry out by a full period. Returns the new expiry, or null. */
export async function extendSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  const { rowCount } = await getPool().query(
    'update admin_sessions set expires_at = $1 where token_hash = $2 and expires_at > now()',
    [expiresAt, hashToken(token)]
  );
  if (!rowCount) return null;
  cookies().set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return expiresAt;
}

export async function logout() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return;
  await getPool().query('delete from admin_sessions where token_hash = $1', [hashToken(token)]);
}

/** Signs a user out everywhere (after a password reset, a role change or deactivation). */
export async function revokeSessions(adminId, exceptSessionId = null) {
  await getPool().query(
    'delete from admin_sessions where admin_id = $1 and ($2::uuid is null or id <> $2::uuid)',
    [adminId, exceptSessionId]
  );
}

/** Deletes expired sessions and stale OTPs. Cheap enough to call on login. */
export async function pruneExpired() {
  const pool = getPool();
  await pool.query('delete from admin_sessions where expires_at < now()');
  await pool.query("delete from email_otps where expires_at < now() - interval '1 day'");
  await pool.query("delete from email_verifications where expires_at < now() - interval '1 day'");
}

export const ROLES = ['super_admin', 'admin', 'accountant', 'viewer'];

const RANK = { viewer: 0, accountant: 1, admin: 2, super_admin: 3 };

export function hasRole(admin, minimum) {
  if (!admin) return false;
  return (RANK[admin.role] ?? -1) >= (RANK[minimum] ?? 99);
}

/** Never let a secret reach the audit trail, whatever the caller passes in. */
function scrub(value) {
  if (value == null) return null;
  const copy = { ...value };
  for (const key of ['password', 'password_hash', 'token', 'token_hash', 'otp', 'content']) delete copy[key];
  return JSON.stringify(copy);
}

/**
 * Records who did what. `before` and `after` are the images of the record on
 * either side of a change; pass both for an edit, only `after` for a new
 * record, only `before` for a deletion. Accepts an optional pg client so the
 * audit row commits (or rolls back) with the change it describes.
 */
export async function writeAudit({
  adminId = null, adminEmail = null, action, entity = null, entityId = null,
  detail = null, before = null, after = null, ip = null, client = null,
}) {
  const sql = `insert into audit_logs (admin_id, admin_email, action, entity, entity_id, detail, before, after, ip)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
  const params = [adminId, adminEmail, action, entity, entityId == null ? null : String(entityId),
    detail ? JSON.stringify(detail) : null, scrub(before), scrub(after), ip];
  if (client) {
    // Inside a transaction a failed audit must fail the change too.
    await client.query(sql, params);
    return;
  }
  try {
    await getPool().query(sql, params);
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}
