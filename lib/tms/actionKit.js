import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { actionGuard, safeNext } from './auth';
import { check } from './schemas';
import { getI18n } from './i18n/server';

/**
 * Shared plumbing for Server Actions, so every one of them does the same four
 * things in the same order: check the role (and the e-mailed code where
 * needed), validate the input, do the work, and never let a database error
 * reach the browser.
 */

/** After any change, drop cached screens so lists and totals are fresh. */
export function refreshAll() {
  revalidatePath('/tms', 'layout');
}

const KNOWN = { PERSON_NOT_FOUND: 'person_gone', NOT_FOUND: 'not_found', NOT_ALLOWED: 'forbidden', CONFLICT: 'conflict' };

function errorCode(err) {
  if (KNOWN[err?.message]) return KNOWN[err.message];
  if (err?.code === '23505') return 'duplicate';
  if (err?.code === '23503') return 'linked';
  return 'server';
}

/**
 * For the step forms (called from the browser, returns a result object).
 *   work(admin, data) -> { href, id }
 */
export async function runAction({ minimum, otp = false, schema, input, work, label = 'action' }) {
  const { t } = await getI18n();
  const guard = await actionGuard(minimum, { otp });
  if (guard.error) return { ok: false, error: t(`err.${guard.error}`) };

  const parsed = schema ? check(schema, input) : { ok: true, data: input };
  if (!parsed.ok) {
    const errors = {};
    for (const [field, code] of Object.entries(parsed.errors)) errors[field] = t(`err.${code}`);
    return { ok: false, errors, error: t('err.check_fields') };
  }
  // The id of the record being edited travels beside the validated fields.
  if (input && typeof input === 'object' && input.id && parsed.data && typeof parsed.data === 'object') parsed.data.id = input.id;

  try {
    const result = await work(guard.admin, parsed.data);
    refreshAll();
    return { ok: true, ...result };
  } catch (err) {
    console.error(`[TMS] ${label} failed:`, err?.message);
    return { ok: false, error: t(`err.${errorCode(err)}`) };
  }
}

/**
 * For plain <form action={...}> actions: returns the signed-in user, or sends
 * the browser to sign-in, "no access", or the code screen.
 */
export async function guardForm(minimum, { otp = false, back = '/' } = {}) {
  const guard = await actionGuard(minimum, { otp });
  if (guard.error === 'auth') redirect('/login');
  if (guard.error === 'forbidden') redirect('/no-access');
  if (guard.error === 'otp') redirect(`/verify?next=${encodeURIComponent(safeNext(back))}`);
  return guard.admin;
}

/**
 * Runs the body of a form action and turns any failure into ?err=code on the
 * page the form came from. Returns the body's result on success.
 */
export async function tryForm(back, label, work) {
  let failure = null;
  let result;
  try {
    result = await work();
  } catch (err) {
    console.error(`[TMS] ${label} failed:`, err?.message);
    failure = errorCode(err);
  }
  if (failure) redirect(withParam(back, 'err', failure));
  refreshAll();
  return result;
}

export function withParam(path, key, value) {
  const clean = safeNext(path);
  return `${clean}${clean.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}
