/**
 * Creates or updates an admin user.
 *
 * Usage:
 *   npm run admin:create -- --email you@example.com --name "Your Name" --role super_admin
 *
 * If --password is omitted a strong one is generated and printed once.
 * Roles: super_admin | admin | accountant | viewer
 */
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `scrypt:${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}

async function main() {
  const email = (arg('email') || '').trim().toLowerCase();
  const name = arg('name') || email.split('@')[0];
  const role = arg('role', 'super_admin');
  let password = arg('password');
  let generated = false;

  if (!email) {
    console.error('Missing --email.\n  npm run admin:create -- --email you@example.com --name "Your Name" --role super_admin');
    process.exit(1);
  }
  if (!['super_admin', 'admin', 'accountant', 'viewer'].includes(role)) {
    console.error(`Invalid role "${role}". Use super_admin, admin, accountant or viewer.`);
    process.exit(1);
  }
  if (!password) {
    password = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }
  if (password.length < 10) {
    console.error('Password must be at least 10 characters.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query(
      `insert into admin_users (email, name, password_hash, role)
       values ($1,$2,$3,$4)
       on conflict (email) do update
         set name = excluded.name,
             password_hash = excluded.password_hash,
             role = excluded.role,
             is_active = true,
             failed_attempts = 0,
             locked_until = null
       returning id, email, name, role`,
      [email, name, hashPassword(password), role]
    );

    const admin = rows[0];
    console.log('\nAdmin ready:');
    console.log(`  email : ${admin.email}`);
    console.log(`  name  : ${admin.name}`);
    console.log(`  role  : ${admin.role}`);
    if (generated) {
      console.log(`\n  PASSWORD (shown once, save it now): ${password}\n`);
    }
    console.log('Sign in at /admin/login');
  } catch (err) {
    console.error('Failed to create admin:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
