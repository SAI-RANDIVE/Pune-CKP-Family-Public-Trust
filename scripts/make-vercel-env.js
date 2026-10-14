/**
 * Writes .env.vercel: every setting the hosted site needs, ready to paste into
 * Vercel (Project > Settings > Environment Variables > paste into the first
 * "Key" box; Vercel splits the lines by itself).
 *
 *   node scripts/make-vercel-env.js                 alpha on the free *.vercel.app addresses
 *   node scripts/make-vercel-env.js --domain puneckptrust.in   after the domain is bought
 *
 * Secrets are copied from .env.local and never printed. The file is in
 * .gitignore: it must never be committed or sent to anyone.
 *
 * Alpha defaults: the demo database (DATA_MODE=demo), search engines kept out
 * (SITE_INDEXING=off), a fresh CRON_SECRET. Change DATA_MODE to live when the
 * trustees are ready to work on the real books.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : null; };
const domain = arg('domain');
const site = arg('site') || 'puneckptrust';

const local = {};
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) local[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

const previous = {};
const target = path.join(root, '.env.vercel');
if (fs.existsSync(target)) {
  for (const line of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) previous[m[1]] = m[2];
  }
}

const copy = ['DATABASE_URL', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NEXT_PUBLIC_RAZORPAY_KEY_ID', 'RAZORPAY_WEBHOOK_SECRET',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_NAME', 'OTP_PEPPER',
  'NEXT_PUBLIC_TRUST_NAME', 'NEXT_PUBLIC_TRUST_REG_NO', 'NEXT_PUBLIC_TRUST_PAN', 'NEXT_PUBLIC_TRUST_ADDRESS',
  'NEXT_PUBLIC_TRUST_PHONE', 'NEXT_PUBLIC_TRUST_EMAIL'];
const missing = copy.filter((k) => !local[k] && k !== 'RAZORPAY_WEBHOOK_SECRET');

const out = {};
for (const k of copy) if (local[k]) out[k] = local[k];
out.NEXT_PUBLIC_TRUST_WEBSITE = domain ? `https://${domain}` : `https://${site}.vercel.app`;
out.NEXT_PUBLIC_ADMIN_HOST = domain ? `admin.${domain}` : `${site}-admin.vercel.app`;
out.SITE_INDEXING = domain ? 'on' : 'off';
out.DATA_MODE = previous.DATA_MODE || 'demo';
out.DEMO_DATABASE_NAME = local.DEMO_DATABASE_NAME || 'ckp_demo';
// The webhook secret is chosen by whoever creates the Razorpay webhook; make one if none is set yet
// (the same value is then pasted into Razorpay > Settings > Webhooks).
if (!out.RAZORPAY_WEBHOOK_SECRET) out.RAZORPAY_WEBHOOK_SECRET = previous.RAZORPAY_WEBHOOK_SECRET || crypto.randomBytes(18).toString('hex');
// Keep the same secret across re-runs, so Vercel's copy does not go stale.
out.CRON_SECRET = previous.CRON_SECRET || crypto.randomBytes(32).toString('hex');

// One KEY=value per line, no quotes and no comments: exactly what Vercel's paste box expects.
fs.writeFileSync(target, `${Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n')}\n`);
console.log(`Wrote .env.vercel with ${Object.keys(out).length} settings (values not shown).`);
console.log(`  public site:        ${out.NEXT_PUBLIC_TRUST_WEBSITE}`);
console.log(`  management system:  https://${out.NEXT_PUBLIC_ADMIN_HOST}`);
console.log(`  DATA_MODE=${out.DATA_MODE}  SITE_INDEXING=${out.SITE_INDEXING}`);
if (missing.length) console.log(`  Not in .env.local, so left out: ${missing.join(', ')}`);
