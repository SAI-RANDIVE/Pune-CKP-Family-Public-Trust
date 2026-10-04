import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getPool } from './db';

/**
 * Admin authentication: scrypt password hashing + opaque session cookies.
 *
 * No JWT here on purpose — sessions live in Postgres so an admin can be
 * revoked instantly, which a self-contained signed token can't give you.
 */

export const SESSION_COOKIE = 'ckp_admin_session';
const SESSION_TTL_HOURS = 12;
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

/** Authenticates, applying lockout after repeated failures. */
export async function login({ email, password, ip = null, userAgent = null }) {
  const pool = getPool();
  const mail = String(email || '').trim().toLowerCase();

  const { rows } = await pool.query('select * from admin_users where email = $1', [mail]);
  const admin = rows[0];

  // Same message and similar work either way, so this can't be used to
  // enumerate which admin emails exist.
  const generic = { ok: false, error: 'Email or password is incorrect.' };
  if (!admin || !admin.is_active) {
    crypto.scryptSync(String(password || ''), 'decoy-salt', 64);
    return generic;
  }

  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(admin.locked_until) - Date.now()) / 60000);
    return { ok: false, error: `Account locked after too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` };
  }

  if (!verifyPassword(password, admin.password_hash)) {
    const attempts = admin.failed_attempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null;
    await pool.query('update admin_users set failed_attempts = $1, locked_until = $2 where id = $3', [attempts, lock, admin.id]);
    await writeAudit({ adminId: admin.id, adminEmail: admin.email, action: 'login_failed', ip });
    return lock
      ? { ok: false, error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.` }
      : generic;
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

  return { ok: true, token, expiresAt, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } };
}

/** Reads the session cookie and returns the admin, or null. */
export async function getCurrentAdmin() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const { rows } = await getPool().query(
    `select a.id, a.email, a.name, a.role, s.id as session_id, s.expires_at
       from admin_sessions s
       join admin_users a on a.id = s.admin_id
      where s.token_hash = $1 and s.expires_at > now() and a.is_active = true`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

export async function logout() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return;
  await getPool().query('delete from admin_sessions where token_hash = $1', [hashToken(token)]);
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

export async function writeAudit({ adminId = null, adminEmail = null, action, entity = null, entityId = null, detail = null, ip = null }) {
  try {
    await getPool().query(
      'insert into audit_logs (admin_id, admin_email, action, entity, entity_id, detail, ip) values ($1,$2,$3,$4,$5,$6,$7)',
      [adminId, adminEmail, action, entity, entityId, detail ? JSON.stringify(detail) : null, ip]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}
