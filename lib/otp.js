import crypto from 'crypto';
import { getPool } from './db';

/**
 * Email OTP verification, used to prove a payer owns the email address
 * before any Razorpay order is created.
 *
 * Design notes:
 *  - The raw OTP is never stored. Only sha256(otp + pepper) goes to the DB.
 *  - Codes expire in 10 minutes and allow 5 attempts.
 *  - A successful check consumes the OTP and mints a separate, opaque
 *    verification token. That token — not the email — is what the order
 *    endpoint trusts, so a caller can't just claim an arbitrary address.
 *  - Verification tokens are single-use and expire in 30 minutes, which is
 *    ample for a checkout but short enough to be useless if leaked.
 */

const OTP_TTL_MINUTES = 10;
const VERIFICATION_TTL_MINUTES = 30;
const MAX_ATTEMPTS = 5;

function pepper() {
  // Falls back to the Razorpay secret so the hash is never unsalted, but set
  // OTP_PEPPER explicitly in production.
  return process.env.OTP_PEPPER || process.env.RAZORPAY_KEY_SECRET || 'ckp-trust-otp';
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(`${otp}:${pepper()}`).digest('hex');
}

/** 6 digits, uniformly distributed (no modulo bias). */
export function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  const e = normaliseEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
}

/** Creates and stores an OTP, returning the raw code for emailing. */
export async function createOtp(email, { purpose = 'payment', ip = null } = {}) {
  const pool = getPool();
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  // Invalidate any outstanding codes for this address so only the newest works.
  await pool.query(
    `update email_otps set consumed_at = now()
     where email = $1 and purpose = $2 and consumed_at is null`,
    [normaliseEmail(email), purpose]
  );

  const { rows } = await pool.query(
    `insert into email_otps (email, otp_hash, purpose, max_attempts, expires_at, ip)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [normaliseEmail(email), hashOtp(otp), purpose, MAX_ATTEMPTS, expiresAt, ip]
  );

  return { id: rows[0].id, otp, expiresAt, minutes: OTP_TTL_MINUTES };
}

/**
 * Voids a code whose email never actually went out. Without this the row sits
 * there unconsumed, so it still counts as the newest outstanding code and the
 * admin OTP stats show codes nobody could ever have received.
 */
export async function discardOtp(id) {
  if (!id) return;
  await getPool().query(
    'update email_otps set consumed_at = now() where id = $1 and consumed_at is null',
    [id]
  );
}

/**
 * Checks an OTP. On success returns { ok: true, token } — a verification token
 * the caller must pass to create-order.
 */
export async function verifyOtp(email, otp, { purpose = 'payment' } = {}) {
  const pool = getPool();
  const mail = normaliseEmail(email);
  const code = String(otp || '').trim();

  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: 'Enter the 6-digit code from your email.' };
  }

  const { rows } = await pool.query(
    `select * from email_otps
     where email = $1 and purpose = $2 and consumed_at is null
     order by created_at desc limit 1`,
    [mail, purpose]
  );

  if (!rows.length) {
    return { ok: false, error: 'That code has expired or was already used. Request a new one.' };
  }

  const record = rows[0];

  if (new Date(record.expires_at).getTime() < Date.now()) {
    await pool.query('update email_otps set consumed_at = now() where id = $1', [record.id]);
    return { ok: false, error: 'That code has expired. Request a new one.' };
  }

  if (record.attempts >= record.max_attempts) {
    await pool.query('update email_otps set consumed_at = now() where id = $1', [record.id]);
    return { ok: false, error: 'Too many incorrect attempts. Request a new code.' };
  }

  // Constant-time compare so a wrong code can't be probed by timing.
  const expected = Buffer.from(record.otp_hash, 'hex');
  const actual = Buffer.from(hashOtp(code), 'hex');
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!matches) {
    await pool.query('update email_otps set attempts = attempts + 1 where id = $1', [record.id]);
    const left = record.max_attempts - record.attempts - 1;
    return {
      ok: false,
      error: left > 0
        ? `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'That code is not correct. Request a new one.',
    };
  }

  await pool.query('update email_otps set consumed_at = now() where id = $1', [record.id]);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60_000);
  await pool.query(
    'insert into email_verifications (email, token, expires_at) values ($1, $2, $3)',
    [mail, token, expiresAt]
  );

  return { ok: true, token, email: mail, expiresAt };
}

/**
 * Validates a verification token against the email the payment claims.
 * Does NOT consume it — the order endpoint may need to retry.
 */
export async function checkVerification(token, email) {
  if (!token) return { ok: false, error: 'Please verify your email address first.' };
  const pool = getPool();
  const { rows } = await pool.query('select * from email_verifications where token = $1', [String(token)]);
  if (!rows.length) return { ok: false, error: 'Your email verification is no longer valid. Please verify again.' };

  const v = rows[0];
  if (new Date(v.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'Your email verification has expired. Please verify again.' };
  }
  if (normaliseEmail(email) !== v.email) {
    return { ok: false, error: 'The verified email does not match the email on this form.' };
  }
  return { ok: true, verificationId: v.id, email: v.email };
}

/** Marks a verification used, once its payment row exists. */
export async function consumeVerification(id) {
  await getPool().query('update email_verifications set used_at = now() where id = $1 and used_at is null', [id]);
}
