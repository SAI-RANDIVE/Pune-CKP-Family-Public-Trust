import { NextResponse } from 'next/server';
import { isValidEmail, normaliseEmail, verifyOtp } from '../../../../lib/otp';
import { clientIp, rateLimit } from '../../../../lib/rateLimit';

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
  const limited = await rateLimit({ key: `otp:verify:ip:${ip}`, limit: 30, windowSeconds: 900 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } }
    );
  }

  try {
    const result = await verifyOtp(email, body.otp, { purpose: 'payment' });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ verified: true, token: result.token, email: result.email });
  } catch (err) {
    console.error('OTP verification failed:', err);
    return NextResponse.json({ error: 'Could not verify that code. Please try again.' }, { status: 500 });
  }
}
