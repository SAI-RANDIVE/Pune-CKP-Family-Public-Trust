import { revalidatePath } from 'next/cache';
import { apiGuard, audit } from '../../../../../../lib/tms/auth';
import { isUuid, one } from '../../../../../../lib/tms/db';
import { bumpLive } from '../../../../../../lib/tms/live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PER_EVENT = 60;
const fail = (status, error) => Response.json({ ok: false, error }, { status });

/** What the file really is, read from its first bytes; the browser's claim is not trusted. */
function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Adds a banner or a photograph to an event. The browser shrinks the picture
 * before sending it (components/tms/MediaUploader.js), so a phone photo of
 * many megabytes arrives here as a few hundred kilobytes.
 */
export async function POST(request, { params }) {
  const guard = await apiGuard(request, 'accountant', { write: true });
  if (guard.response) return guard.response;
  if (!isUuid(params.id)) return fail(404, 'not_found');
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES + 200_000) return fail(413, 'file_big');

  try {
    const form = await request.formData();
    const file = form.get('file');
    const kind = form.get('kind') === 'banner' ? 'banner' : 'photo';
    const caption = String(form.get('caption') || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200) || null;
    if (!file || typeof file === 'string') return fail(400, 'invalid');
    if (file.size === 0 || file.size > MAX_BYTES) return fail(413, 'file_big');

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = sniff(buffer);
    if (!mime) return fail(415, 'file_type');

    const event = await one(
      `select e.id, (select count(*)::int from event_media m where m.event_id = e.id) as n
         from events e where e.id = $1 and e.deleted_at is null`, [params.id]);
    if (!event) return fail(404, 'not_found');
    if (event.n >= MAX_PER_EVENT) return fail(409, 'too_many');

    // An event has one banner: a new one replaces the old.
    if (kind === 'banner') await one("delete from event_media where event_id = $1 and kind = 'banner' returning id", [params.id]);
    const saved = await one(
      `insert into event_media (event_id, kind, mime, size_bytes, content, caption, uploaded_by, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7, (select coalesce(max(sort_order), 0) + 1 from event_media where event_id = $1))
       returning id`, [params.id, kind, mime, buffer.length, buffer, caption, guard.admin.id]);
    await audit(guard.admin, {
      action: 'event_media_added', entity: 'events', entityId: params.id,
      after: { media_id: saved.id, kind, mime, size_bytes: buffer.length, caption },
    });
    await bumpLive('events');
    revalidatePath('/events');
    revalidatePath('/');
    return Response.json({ ok: true, id: saved.id });
  } catch (err) {
    console.error('[TMS] event media upload failed:', err?.message);
    return fail(500, 'server');
  }
}

/** One stored picture (?m=<media id>), for the management screen. Signed-in users only. */
export async function GET(request, { params }) {
  const guard = await apiGuard(request, 'viewer');
  if (guard.response) return guard.response;
  const mediaId = new URL(request.url).searchParams.get('m');
  if (!isUuid(params.id) || !isUuid(mediaId)) return new Response('Not found', { status: 404 });
  const row = await one('select mime, content from event_media where id = $1 and event_id = $2', [mediaId, params.id]);
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(row.content, {
    status: 200,
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
  });
}
