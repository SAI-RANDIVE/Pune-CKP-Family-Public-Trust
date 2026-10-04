'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getCurrentAdmin, hasRole, writeAudit } from '../../../lib/adminAuth';
import { deliverReceipt } from '../../../lib/fulfil';
import { getPool } from '../../../lib/db';

function ip() {
  return (headers().get('x-forwarded-for') || '').split(',')[0].trim() || null;
}

/** Re-sends the receipt email for a payment. */
export async function resendReceipt(formData) {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false, error: 'Not signed in.' };
  if (!hasRole(admin, 'accountant')) return { ok: false, error: 'You do not have permission to re-send receipts.' };

  const paymentId = String(formData.get('paymentId') || '');
  if (!paymentId) return { ok: false, error: 'Missing payment.' };

  try {
    await deliverReceipt(paymentId);
    await writeAudit({
      adminId: admin.id, adminEmail: admin.email,
      action: 'receipt_resent', entity: 'payment', entityId: paymentId, ip: ip(),
    });
    revalidatePath('/admin/payments');
    return { ok: true };
  } catch (err) {
    await writeAudit({
      adminId: admin.id, adminEmail: admin.email,
      action: 'receipt_resend_failed', entity: 'payment', entityId: paymentId,
      detail: { error: err.message }, ip: ip(),
    });
    return { ok: false, error: err.message };
  }
}

/** Regenerates a receipt PDF from the current payment row. */
export async function regenerateReceipt(formData) {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false, error: 'Not signed in.' };
  if (!hasRole(admin, 'accountant')) return { ok: false, error: 'You do not have permission to do that.' };

  const paymentId = String(formData.get('paymentId') || '');
  const pool = getPool();
  await pool.query('update payments set receipt_pdf = null, receipt_generated_at = null where id = $1', [paymentId]);
  await writeAudit({
    adminId: admin.id, adminEmail: admin.email,
    action: 'receipt_regenerated', entity: 'payment', entityId: paymentId, ip: ip(),
  });
  revalidatePath('/admin/payments');
  return { ok: true };
}

/** Saves an internal note against a member. */
export async function saveMemberNote(formData) {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false, error: 'Not signed in.' };
  if (!hasRole(admin, 'admin')) return { ok: false, error: 'You do not have permission to edit members.' };

  const memberId = String(formData.get('memberId') || '');
  const note = String(formData.get('note') || '').slice(0, 2000);

  await getPool().query('update members set notes = $1, updated_at = now() where id = $2', [note, memberId]);
  await writeAudit({
    adminId: admin.id, adminEmail: admin.email,
    action: 'member_note_updated', entity: 'member', entityId: memberId,
    detail: { length: note.length }, ip: ip(),
  });
  revalidatePath('/admin/members');
  return { ok: true };
}
