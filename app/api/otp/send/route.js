import { NextResponse } from 'next/server';
import { createOtp, discardOtp, isValidEmail, normaliseEmail } from '../../../../lib/otp';
import { describeMailError, isEmailConfigured, sendOtpEmail } from '../../../../lib/email';
import { clientIp, rateLimit, releaseRateLimit } from '../../../../lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const email = normaliseEmail(body.email);
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const ip = clientIp(req);

  // Two buckets: stops one address being spammed, and stops one machine
  // enumerating many addresses.
  const emailBucket = `otp:send:email:${email}`;
  const perEmail = await rateLimit({ key: emailBucket, limit: 5, windowSeconds: 900 });
  if (!perEmail.ok) {
    return NextResponse.json(
      { error: `Too many codes requested for this email. Try again in ${Math.ceil(perEmail.retryAfterSeconds / 60)} minutes.` },
      { status: 429, headers: { 'Retry-After': String(perEmail.retryAfterSeconds) } }
    );
  }

  const ipBucket = `otp:send:ip:${ip}`;
  const perIp = await rateLimit({ key: ipBucket, limit: 20, windowSeconds: 900 });
  if (!perIp.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(perIp.retryAfterSeconds) } }
    );
  }

  if (!isEmailConfigured()) {
    console.error('OTP requested but SMTP is not configured — set SMTP_USER and SMTP_PASS.');
    return NextResponse.json(
      { error: 'Email verification is temporarily unavailable. Please contact the trust.' },
      { status: 503 }
    );
  }

  let otpId = null;
  try {
    const { id, otp, minutes } = await createOtp(email, { purpose: 'payment', ip });
    otpId = id;
    await sendOtpEmail({ to: email, otp, minutes });
    return NextResponse.json({ sent: true, email, expiresInMinutes: minutes });
  } catch (err) {
    // describeMailError pulls out the SMTP reply ("535 Bad credentials",
    // "454 too many login attempts"), which is the only part that actually
    // says what went wrong — err.message alone is generic.
    const detail = describeMailError(err);
    console.error(`Failed to send OTP to ${email}: ${detail}`);

    // Nothing was delivered, so leave no trace that pretends otherwise: void
    // the unsent code and give back the rate-limit slots it consumed.
    await Promise.allSettled([
      discardOtp(otpId),
      releaseRateLimit(emailBucket),
      releaseRateLimit(ipBucket),
    ]);

    return NextResponse.json(
      {
        error: 'We could not send the verification email. Check the address and try again.',
        // Only in dev — the SMTP reply can name the account and is not something
        // to hand to the public.
        ...(process.env.NODE_ENV === 'production' ? {} : { detail }),
      },
      { status: 502 }
    );
  }
}
