import crypto from 'crypto';
import { apiGuard, audit } from '../../../../lib/tms/auth';
import { isUuid, one } from '../../../../lib/tms/db';
import { MAX_UPLOAD_BYTES, UPLOAD_TABLES, UPLOAD_TYPES } from '../../../../lib/tms/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (status, error) => Response.json({ ok: false, error }, { status });

/** What the file really is, read from its first bytes; the browser's claim is not trusted. */
function sniff(buf) {
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Attaches a bill, voucher scan or deposit paper (image or PDF, up to 5 MB) to a record. */
export async function POST(request) {
  const guard = await apiGuard(request, 'accountant', { write: true });
  if (guard.response) return guard.response;

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_UPLOAD_BYTES + 200_000) return fail(413, 'file_big');

  try {
    const form = await request.formData();
    const file = form.get('file');
    const table = String(form.get('record_table') || '');
    const recordId = String(form.get('record_id') || '');
    if (!file || typeof file === 'string' || !UPLOAD_TABLES.includes(table) || !isUuid(recordId)) return fail(400, 'invalid');
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return fail(413, 'file_big');

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = sniff(buffer);
    if (!mime || !UPLOAD_TYPES.includes(mime)) return fail(415, 'file_type');

    // `table` is one of UPLOAD_TABLES, never free text.
    const record = await one(`select id from ${table} where id = $1`, [recordId]);
    if (!record) return fail(404, 'not_found');

    const name = String(file.name || 'attachment').replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(-120) || 'attachment';
    const sha = crypto.createHash('sha256').update(buffer).digest('hex');
    const saved = await one(
      `insert into documents (record_table, record_id, file_name, mime, sha256, size_bytes, content, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [table, recordId, name, mime, sha, buffer.length, buffer, guard.admin.id]);
    await audit(guard.admin, {
      action: 'document_attached', entity: table, entityId: recordId,
      after: { document_id: saved.id, file_name: name, mime, size_bytes: buffer.length, sha256: sha },
    });
    return Response.json({ ok: true, id: saved.id });
  } catch (err) {
    console.error('[TMS] upload failed:', err?.message);
    return fail(500, 'server');
  }
}
