import { getPool } from './db';

/**
 * Fixed-window rate limiting backed by Postgres.
 *
 * Postgres rather than in-memory because the site runs on serverless functions,
 * where each invocation may be a fresh process — an in-memory counter would
 * reset constantly and enforce nothing. One upsert per call is cheap.
 */
export async function rateLimit({ key, limit, windowSeconds }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `insert into rate_limits (bucket, count, window_start)
     values ($1, 1, now())
     on conflict (bucket) do update set
       count = case
         when rate_limits.window_start < now() - ($2 || ' seconds')::interval then 1
         else rate_limits.count + 1
       end,
       window_start = case
         when rate_limits.window_start < now() - ($2 || ' seconds')::interval then now()
         else rate_limits.window_start
       end
     returning count, window_start`,
    [key, String(windowSeconds)]
  );

  const { count, window_start: windowStart } = rows[0];
  const resetAt = new Date(new Date(windowStart).getTime() + windowSeconds * 1000);
  return {
    ok: count <= limit,
    count,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
  };
}

/**
 * Hands one slot back to a bucket. Used when the thing that was counted did
 * not actually happen — someone whose verification email failed to send should
 * not lose one of their five attempts for it, or five failures in a row lock
 * them out for fifteen minutes having never received a code.
 */
export async function releaseRateLimit(key) {
  const pool = getPool();
  await pool.query(
    'update rate_limits set count = greatest(0, count - 1) where bucket = $1',
    [key]
  );
}

/** Best-effort client IP from the usual proxy headers. */
export function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || req.ip || 'unknown';
}
