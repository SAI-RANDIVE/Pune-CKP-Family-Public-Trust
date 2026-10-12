import crypto from 'crypto';
import { sendTodaysGreetings } from '../../../../lib/greetings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The daily greetings job. The hosting platform calls this address once a day
 * (see vercel.json); it sends that day's birthday and anniversary e-mails.
 *
 * Only a caller that knows CRON_SECRET may run it (Vercel sends it as
 * "Authorization: Bearer <secret>" automatically when the variable is set), so
 * nobody on the internet can trigger a round of e-mails. Running it twice in a
 * day is harmless: each greeting is sent once per person per year.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET || '';
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const ok = secret.length >= 16 && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new Response('Not found', { status: 404 });

  try {
    const result = await sendTodaysGreetings();
    return Response.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[greetings] job failed:', err?.message);
    return Response.json({ ok: false }, { status: 500 });
  }
}
