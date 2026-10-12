'use server';

import { redirect } from 'next/navigation';
import { hashPassword, revokeSessions, writeAudit } from '../../adminAuth';
import { tx, isUuid } from '../db';
import { clientIp } from '../auth';
import { guardForm, tryForm, withParam } from '../actionKit';
import { userSchema, categorySchema, password as passwordRule, ROLE_VALUES, check } from '../schemas';
import { AREAS, FLAGS, LEVELS, normalisePermissions } from '../access';
import { OFFICER_TITLES } from '../constants';

const USERS = '/settings/users';
const image = (u) => (u ? { id: u.id, email: u.email, username: u.username, name: u.name, role: u.role, is_active: u.is_active } : null);

/** Creates a login. Super Admin + e-mailed code. The first password is typed here and told to the user in person. */
export async function createUser(formData) {
  const admin = await guardForm('super_admin', { otp: true, back: USERS });
  const parsed = check(userSchema, Object.fromEntries(['name', 'email', 'username', 'role'].map((k) => [k, formData.get(k)])));
  if (!parsed.ok) redirect(withParam(USERS, 'err', Object.values(parsed.errors)[0]));
  const pw = passwordRule.safeParse(String(formData.get('password') || ''));
  if (!pw.success) redirect(withParam(USERS, 'err', pw.error.issues[0].message));
  const v = parsed.data;

  await tryForm(USERS, 'createUser', () => tx(async (client) => {
    const inserted = await client.query(
      `insert into admin_users (email, name, username, password_hash, role) values ($1,$2,$3,$4,$5) returning *`,
      [v.email, v.name, v.username, hashPassword(pw.data), v.role]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'user_created', entity: 'admin_users', entityId: inserted.rows[0].id, after: image(inserted.rows[0]),
    });
  }));
  redirect(withParam(USERS, 'ok', 'user_created'));
}

/** Changes a login's role or switches it on/off. Super Admin + e-mailed code. */
export async function updateUser(formData) {
  const admin = await guardForm('super_admin', { otp: true, back: USERS });
  const id = String(formData.get('id') || '');
  const role = String(formData.get('role') || '');
  const active = formData.get('is_active') === 'true';
  if (!isUuid(id) || !ROLE_VALUES.includes(role)) redirect(withParam(USERS, 'err', 'required'));
  // Nobody removes their own access by accident.
  if (id === admin.id) redirect(withParam(USERS, 'err', 'self'));

  await tryForm(USERS, 'updateUser', () => tx(async (client) => {
    const { rows } = await client.query('select * from admin_users where id = $1 for update', [id]);
    const before = rows[0];
    if (!before) throw new Error('NOT_FOUND');
    const updated = await client.query('update admin_users set role = $2, is_active = $3 where id = $1 returning *', [id, role, active]);
    const { rows: supers } = await client.query("select count(*)::int as n from admin_users where role = 'super_admin' and is_active");
    if (supers[0].n < 1) throw new Error('CONFLICT');
    await client.query('delete from admin_sessions where admin_id = $1', [id]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: before.role !== role ? 'user_role_changed' : 'user_updated', entity: 'admin_users', entityId: id,
      before: image(before), after: image(updated.rows[0]),
    });
  }));
  redirect(withParam(USERS, 'ok', 'updated'));
}

/** Sets a new password for someone who forgot theirs, and signs them out everywhere. */
export async function resetUserPassword(formData) {
  const admin = await guardForm('super_admin', { otp: true, back: USERS });
  const id = String(formData.get('id') || '');
  const pw = passwordRule.safeParse(String(formData.get('password') || ''));
  if (!isUuid(id)) redirect(withParam(USERS, 'err', 'required'));
  if (!pw.success) redirect(withParam(USERS, 'err', pw.error.issues[0].message));

  await tryForm(USERS, 'resetUserPassword', async () => {
    await tx(async (client) => {
      const res = await client.query(
        'update admin_users set password_hash = $2, failed_attempts = 0, locked_until = null where id = $1', [id, hashPassword(pw.data)]);
      if (!res.rowCount) throw new Error('NOT_FOUND');
      await writeAudit({
        client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
        action: 'user_password_reset', entity: 'admin_users', entityId: id,
      });
    });
    await revokeSessions(id, id === admin.id ? admin.session_id : null);
  });
  redirect(withParam(USERS, 'ok', 'password'));
}

/**
 * Section-by-section access and the two sensitive abilities for one login,
 * plus the office the person holds. Super Admin + e-mailed code; the person is
 * signed out everywhere so the change takes effect at once.
 */
export async function updateUserAccess(formData) {
  const admin = await guardForm('super_admin', { otp: true, back: USERS });
  const id = String(formData.get('id') || '');
  if (!isUuid(id)) redirect(withParam(USERS, 'err', 'required'));
  if (id === admin.id) redirect(withParam(USERS, 'err', 'self'));

  const areas = {};
  for (const area of AREAS) {
    const level = String(formData.get(`area_${area}`) || 'edit');
    areas[area] = LEVELS.includes(level) ? level : 'edit';
  }
  const flags = {};
  for (const flag of FLAGS) flags[flag] = formData.get(`flag_${flag}`) === 'on';
  const permissions = normalisePermissions({ areas, flags });
  const title = String(formData.get('designation') || '');
  const designation = OFFICER_TITLES.some((o) => o.key === title) ? title : null;

  await tryForm(USERS, 'updateUserAccess', () => tx(async (client) => {
    const { rows } = await client.query('select * from admin_users where id = $1 for update', [id]);
    const before = rows[0];
    if (!before) throw new Error('NOT_FOUND');
    await client.query('update admin_users set permissions = $2::jsonb, designation = $3 where id = $1', [id, JSON.stringify(permissions), designation]);
    await client.query('delete from admin_sessions where admin_id = $1', [id]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'user_access_changed', entity: 'admin_users', entityId: id,
      before: { permissions: before.permissions, designation: before.designation }, after: { permissions, designation },
    });
  }));
  redirect(withParam(USERS, 'ok', 'access_saved'));
}

const CATS = '/settings/categories';
const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'category';

/** Adds an income or expense head, or renames one (when id is set). */
export async function saveCategory(formData) {
  const admin = await guardForm('admin', { back: CATS });
  const id = String(formData.get('id') || '');
  const parsed = check(categorySchema, Object.fromEntries(['kind', 'name_en', 'name_mr'].map((k) => [k, formData.get(k)])));
  if (!parsed.ok) redirect(withParam(CATS, 'err', Object.values(parsed.errors)[0]));
  const v = parsed.data;
  const back = `${CATS}?kind=${v.kind}`;

  await tryForm(back, 'saveCategory', () => tx(async (client) => {
    if (id) {
      if (!isUuid(id)) throw new Error('NOT_FOUND');
      const { rows } = await client.query('select * from categories where id = $1 for update', [id]);
      if (!rows.length) throw new Error('NOT_FOUND');
      const updated = await client.query('update categories set name_en = $2, name_mr = $3 where id = $1 returning *', [id, v.name_en, v.name_mr]);
      await writeAudit({
        client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
        action: 'category_updated', entity: 'categories', entityId: id, before: rows[0], after: updated.rows[0],
      });
      return;
    }
    const base = slug(v.name_en);
    const { rows: taken } = await client.query('select count(*)::int as n from categories where code = $1 or code like $2', [base, `${base}-%`]);
    const code = taken[0].n ? `${base}-${taken[0].n + 1}` : base;
    const inserted = await client.query(
      'insert into categories (code, kind, name_en, name_mr) values ($1,$2,$3,$4) returning *', [code, v.kind, v.name_en, v.name_mr]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'category_created', entity: 'categories', entityId: inserted.rows[0].id, after: inserted.rows[0],
    });
  }));
  redirect(withParam(back, 'ok', 'saved'));
}

/** Hides a head from the entry forms (old entries keep it) or brings it back. */
export async function toggleCategory(formData) {
  const admin = await guardForm('admin', { back: CATS });
  const id = String(formData.get('id') || '');
  if (!isUuid(id)) redirect(withParam(CATS, 'err', 'required'));

  const kind = await tryForm(CATS, 'toggleCategory', () => tx(async (client) => {
    const { rows } = await client.query('select * from categories where id = $1 for update', [id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    const updated = await client.query('update categories set is_active = not is_active where id = $1 returning *', [id]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: updated.rows[0].is_active ? 'category_enabled' : 'category_disabled', entity: 'categories', entityId: id,
      before: rows[0], after: updated.rows[0],
    });
    return rows[0].kind;
  }));
  redirect(withParam(`${CATS}?kind=${kind}`, 'ok', 'updated'));
}
