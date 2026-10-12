/**
 * Which database the scripts talk to. Mirrors lib/db.js so that the website
 * and the command-line tools always agree.
 *
 *   DATA_MODE=demo   -> the demo database (a separate database on the same
 *                       server, named by DEMO_DATABASE_NAME, default ckp_demo)
 *   anything else    -> the trust's real database, exactly as DATABASE_URL says
 */
const DEMO_NAME = process.env.DEMO_DATABASE_NAME || 'ckp_demo';

function withDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

function isDemo() {
  return String(process.env.DATA_MODE || '').toLowerCase() === 'demo';
}

/** The connection string for the mode in force. `forceDemo` / `forceMain` override the environment. */
function databaseUrl({ forceDemo = false, forceMain = false } = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Put it in .env.local first.');
  if (forceMain) return url;
  return forceDemo || isDemo() ? withDatabase(url, DEMO_NAME) : url;
}

module.exports = { DEMO_NAME, databaseUrl, isDemo, withDatabase };
