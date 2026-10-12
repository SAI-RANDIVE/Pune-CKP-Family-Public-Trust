import { Pool } from 'pg';

// Reused across warm serverless invocations.
let pool;

/**
 * Failures of the connection itself, as opposed to a problem with the query.
 * The first group happens before anything was sent, so trying again is always
 * safe. The second group can happen mid-flight; those are retried only for
 * plain reads, never for a statement that might already have changed data.
 */
const BEFORE_SEND = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|before secure TLS connection|timeout exceeded when trying to connect|Connection terminated due to connection timeout/i;
const MID_FLIGHT = /ECONNRESET|EPIPE|Connection terminated unexpectedly|Client has encountered a connection error|terminating connection/i;
const READ_ONLY = /^\s*(select|with)\b(?![\s\S]*\b(insert|update|delete)\b)/i;

const describe = (err) => `${err?.code || ''} ${err?.message || ''}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function isConnectionError(err) {
  const text = describe(err);
  return BEFORE_SEND.test(text) || MID_FLIGHT.test(text);
}

function mayRetry(err, sql) {
  const text = describe(err);
  if (BEFORE_SEND.test(text)) return true;
  return MID_FLIGHT.test(text) && READ_ONLY.test(String(sql || ''));
}

/**
 * True while the site runs on the demo database (DATA_MODE=demo in the
 * environment). The demo is a separate database on the same server, made by
 * `node scripts/demo-db.js create`; nothing done in it can reach the trust's
 * real records. Keep in step with scripts/db-url.js.
 */
export function isDemoMode() {
  return String(process.env.DATA_MODE || '').toLowerCase() === 'demo';
}

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!isDemoMode()) return url;
  const parsed = new URL(url);
  parsed.pathname = `/${process.env.DEMO_DATABASE_NAME || 'ckp_demo'}`;
  return parsed.toString();
}

export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. See .env.example.');
    }
    pool = new Pool({
      connectionString: connectionString(),
      ssl: { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 20000,
      keepAlive: true,
    });
    // A dropped idle connection must never take the whole server down.
    pool.on('error', (err) => console.error('[db] idle connection lost:', err?.code || err?.message));

    // A short network blip (wifi, DNS, the database waking from sleep) should
    // not show the visitor an error page: try again a couple of times first.
    const rawQuery = pool.query.bind(pool);
    pool.query = async (...args) => {
      const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await rawQuery(...args);
        } catch (err) {
          lastError = err;
          if (attempt === 2 || !mayRetry(err, sql)) throw err;
          await wait(350 * (attempt + 1));
        }
      }
      throw lastError;
    };

    const rawConnect = pool.connect.bind(pool);
    pool.connect = async (...args) => {
      if (args.length) return rawConnect(...args); // callback style: untouched
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await rawConnect();
        } catch (err) {
          lastError = err;
          if (attempt === 2 || !BEFORE_SEND.test(describe(err))) throw err;
          await wait(350 * (attempt + 1));
        }
      }
      throw lastError;
    };
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}
