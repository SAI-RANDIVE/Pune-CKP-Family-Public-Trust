import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { getCurrentAdmin, hasRole, writeAudit } from '../adminAuth';
import { one } from './db';
import { areaLevel, areaOfPath, flagAllowed } from './access';

/**
 * The one server-side guard of the management system. Every page calls
 * requireRole(), every Server Action calls actionGuard() and every API route
 * calls apiGuard(). Hiding a button is never the control: these are.
 *
 *   viewer       read-only subset; no Aadhaar/PAN, no exports
 *   accountant   + money entry, people and membership entry, exports (with OTP)
 *   admin        + review queue, merges, deletions, categories, audit log
 *   super_admin  + users and roles, full backup
 */

export const OTP_COOKIE = 'ckp_admin_otp';
export const OTP_GRANT_MINUTES = 10;

/** What each role may do. Checked on the server by the guards below. */
export const PERMISSIONS = {
  view: 'viewer',
  seeIdNumbers: 'accountant',   // Aadhaar and PAN
  enterMoney: 'accountant',
  editPeople: 'accountant',
  export: 'accountant',
  editMoney: 'accountant',      // + OTP
  deleteMoney: 'admin',         // + OTP
  review: 'admin',
  merge: 'admin',               // + OTP
  manageCategories: 'admin',
  manageOfficers: 'admin',
  viewAudit: 'admin',
  manageUsers: 'super_admin',   // role changes + OTP
  backup: 'super_admin',        // + OTP
};

/** The Chairman can switch these off for one login (Settings > Users). */
const FLAG_OF = { seeIdNumbers: 'seeIdNumbers', export: 'export' };

export function can(admin, permission) {
  if (!hasRole(admin, PERMISSIONS[permission] || 'super_admin')) return false;
  return FLAG_OF[permission] ? flagAllowed(admin, FLAG_OF[permission]) : true;
}

/** The section the current request belongs to (from the address), or null for shared screens. */
export function currentArea() {
  return areaOfPath(headers().get('x-tms-path'));
}

/**
 * Section check for the current request. needsChange: the request adds or
 * alters something, so "view only" is not enough.
 */
function areaAllows(admin, needsChange, area = currentArea()) {
  if (!area) return true;
  const level = areaLevel(admin, area);
  return needsChange ? level === 'edit' : level !== 'none';
}

export function clientIp() {
  const h = headers();
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || null;
}

/** For pages: returns the signed-in user or sends the browser to sign-in / "no access". */
export async function requireRole(minimum = 'viewer', opts = {}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  if (!hasRole(admin, minimum)) redirect('/no-access');
  // A page that needs more than a viewer is an entry or edit screen.
  if (!areaAllows(admin, minimum !== 'viewer' && !opts.readOnly)) redirect('/no-access');
  return admin;
}

/** True when the user confirmed an e-mailed code in the last few minutes. */
export async function hasOtpGrant(admin) {
  const token = cookies().get(OTP_COOKIE)?.value;
  if (!admin || !token || !/^[0-9a-f]{64}$/.test(token)) return false;
  const row = await one(
    `select 1 as ok from email_verifications
      where token = $1 and email = $2 and created_at > now() - ($3 || ' minutes')::interval`,
    [token, String(admin.email).toLowerCase(), String(OTP_GRANT_MINUTES)]
  );
  return Boolean(row);
}

const safeNext = (path) => (typeof path === 'string' && /^\/[A-Za-z0-9\-._~/?=&%\[\]]*$/.test(path) && !path.startsWith('//') ? path : '/');

/** For pages that lead to a protected action: asks for the e-mailed code first. */
export async function requireOtp(admin, nextPath) {
  if (!(await hasOtpGrant(admin))) redirect(`/verify?next=${encodeURIComponent(safeNext(nextPath))}`);
}

export { safeNext };

/**
 * For Server Actions. Returns { admin } or { error } where error is
 * 'auth' | 'forbidden' | 'otp'. Server Actions are same-origin POSTs by
 * construction (Next.js compares Origin with Host), which is the CSRF defence.
 */
export async function actionGuard(minimum = 'viewer', { otp = false, readOnly = false } = {}) {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: 'auth' };
  if (!hasRole(admin, minimum)) {
    await writeAudit({ adminId: admin.id, adminEmail: admin.email, action: 'permission_denied', detail: { needed: minimum }, ip: clientIp() });
    return { error: 'forbidden' };
  }
  // Every action changes something, except the few that say they only read.
  if (!areaAllows(admin, !readOnly)) return { error: 'forbidden' };
  if (otp && !(await hasOtpGrant(admin))) return { error: 'otp' };
  return { admin };
}

/** Rejects cross-site requests to API routes (for anything that is not a plain read). */
export function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const json = (status, error) => new Response(JSON.stringify({ ok: false, error }), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

/**
 * For API routes. Returns { admin } or { response } (a ready 401 / 403).
 * Pass write: true for anything that changes data so cross-site calls are refused.
 */
export async function apiGuard(request, minimum = 'viewer', { otp = false, write = false } = {}) {
  if (write && !isSameOrigin(request)) return { response: json(403, 'forbidden') };
  const admin = await getCurrentAdmin();
  if (!admin) return { response: json(401, 'auth') };
  if (!hasRole(admin, minimum)) return { response: json(403, 'forbidden') };
  if (!areaAllows(admin, write, areaOfPath(new URL(request.url).pathname))) return { response: json(403, 'forbidden') };
  if (otp && !(await hasOtpGrant(admin))) return { response: json(403, 'otp') };
  return { admin };
}

/** Audit helper that fills in who and from where. */
export function audit(admin, fields) {
  return writeAudit({ adminId: admin?.id, adminEmail: admin?.email, ip: clientIp(), ...fields });
}

export { hasRole };
