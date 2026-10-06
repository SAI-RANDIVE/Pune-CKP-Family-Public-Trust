/**
 * Creates (or resets) a login for the Trust Management System.
 *
 *   npm run admin:create
 *
 * The script asks for everything it needs: name, e-mail, an optional username,
 * the role and a password (typed twice, not shown on screen). Nothing is
 * hard-coded and no password is ever written to a file or the shell history.
 *
 * For unattended use the non-secret answers may be given as flags; the
 * password is still prompted for unless --generate is passed, in which case a
 * strong one is created and printed once:
 *
 *   npm run admin:create -- --email a@b.in --name "Name" --role super_admin --generate
 *
 * Roles: super_admin | admin | accountant | viewer
 */
const crypto = require('crypto');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const ROLES = ['super_admin', 'admin', 'accountant', 'viewer'];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}
const flag = (name) => process.argv.includes(`--${name}`);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `scrypt:${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

/** Reads a line without echoing it. Falls back to a visible prompt when stdin is not a terminal. */
function askHidden(question) {
  if (!process.stdin.isTTY) return ask(question);
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of String(chunk)) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') { stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); continue; }
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

function passwordProblem(password) {
  if (password.length < 10) return 'The password must be at least 10 characters long.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use both letters and numbers in the password.';
  return null;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Put it in .env.local first.');
    process.exit(1);
  }
  if (arg('password')) {
    console.error('Passing --password on the command line is not supported (it would be saved in the shell history).\nRun the command without it and type the password when asked, or use --generate.');
    process.exit(1);
  }

  console.log('\nTrust Management System - create a login\n');

  let email = (arg('email') || '').toLowerCase();
  while (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    email = (await ask('E-mail address (verification codes are sent here): ')).toLowerCase();
  }

  let name = arg('name');
  while (!name || name.length < 2) name = await ask('Full name: ');

  let username = arg('username');
  if (username == null) username = await ask('Username for signing in (optional, press Enter to skip): ');
  username = username.toLowerCase();
  while (username && !/^[a-z0-9._-]{3,30}$/.test(username)) {
    username = (await ask('Username may use a-z, 0-9, dot, dash, underscore (3 to 30 characters). Try again or press Enter to skip: ')).toLowerCase();
  }

  let role = arg('role');
  while (!ROLES.includes(role)) {
    const answer = await ask(`Role [${ROLES.join(' / ')}] (press Enter for super_admin): `);
    role = answer || 'super_admin';
  }

  let password;
  let generated = false;
  if (flag('generate')) {
    password = `${crypto.randomBytes(9).toString('base64url')}7a`;
    generated = true;
  } else {
    for (;;) {
      password = await askHidden('Password (at least 10 characters, letters and numbers; not shown as you type): ');
      const problem = passwordProblem(password);
      if (problem) { console.log(problem); continue; }
      const again = await askHidden('Type the password again: ');
      if (again !== password) { console.log('The two passwords did not match. Try again.'); continue; }
      break;
    }
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query(
      `insert into admin_users (email, name, username, password_hash, role)
       values ($1,$2,$3,$4,$5)
       on conflict (email) do update
         set name = excluded.name,
             username = coalesce(excluded.username, admin_users.username),
             password_hash = excluded.password_hash,
             role = excluded.role,
             is_active = true,
             failed_attempts = 0,
             locked_until = null
       returning id, email, username, name, role`,
      [email, name, username || null, hashPassword(password), role]
    );
    const admin = rows[0];
    // A reset password must end every existing session for that login.
    await pool.query('delete from admin_sessions where admin_id = $1', [admin.id]);
    await pool.query(
      `insert into audit_logs (admin_id, admin_email, action, entity, entity_id, detail)
       values ($1,$2,'user_created_from_server','admin_users',$4,$3)`,
      [admin.id, admin.email, JSON.stringify({ role: admin.role }), String(admin.id)]
    );

    console.log('\nLogin ready:');
    console.log(`  name     : ${admin.name}`);
    console.log(`  e-mail   : ${admin.email}`);
    if (admin.username) console.log(`  username : ${admin.username}`);
    console.log(`  role     : ${admin.role}`);
    if (generated) console.log(`\n  PASSWORD (shown once, save it now): ${password}`);
    console.log('\nSign in at https://admin.puneckptrust.in/login  (local: http://admin.localhost:3000/login)\n');
  } catch (err) {
    console.error('Could not create the login:', err.code === '23505' ? 'that username is already in use.' : err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
