'use server';

import { getPool } from '../../db';
import { actionGuard } from '../auth';

const KEY = /^[a-z0-9:_-]{1,60}$/;

/** Auto-saves an unfinished entry form (one draft per user per form). */
export async function saveDraft(formKey, data) {
  const { admin } = await actionGuard('accountant');
  if (!admin || !KEY.test(String(formKey)) || !data || typeof data !== 'object') return { ok: false };
  const json = JSON.stringify(data);
  if (json.length > 20000) return { ok: false };
  await getPool().query(
    `insert into form_drafts (admin_id, form_key, data) values ($1,$2,$3)
     on conflict (admin_id, form_key) do update set data = excluded.data, updated_at = now()`,
    [admin.id, formKey, json]
  );
  return { ok: true };
}

export async function clearDraft(formKey) {
  const { admin } = await actionGuard('accountant');
  if (!admin || !KEY.test(String(formKey))) return { ok: false };
  await getPool().query('delete from form_drafts where admin_id = $1 and form_key = $2', [admin.id, formKey]);
  return { ok: true };
}
