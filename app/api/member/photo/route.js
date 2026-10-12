import { getPool } from '../../../../lib/db';
import { getCurrentMember } from '../../../../lib/memberAuth';
import { areFamily } from '../../../../lib/family';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * A profile picture. A member may see their own and those of their confirmed
 * family; nobody else's. Without ?p= it is the member's own.
 */
export async function GET(request) {
  const member = await getCurrentMember();
  if (!member) return new Response('Not found', { status: 404 });
  const wanted = new URL(request.url).searchParams.get('p') || member.person_id;
  if (!UUID.test(wanted)) return new Response('Not found', { status: 404 });
  if (wanted !== member.person_id && !(await areFamily(member.person_id, wanted))) return new Response('Not found', { status: 404 });
  const { rows } = await getPool().query('select mime, content from person_photos where person_id = $1', [wanted]);
  if (!rows.length) return new Response('Not found', { status: 404 });
  return new Response(rows[0].content, {
    status: 200,
    headers: { 'Content-Type': rows[0].mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** The member's own picture: replaces the previous one. The browser crops and shrinks it first. */
export async function POST(request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ ok: false, error: 'Please sign in again.' }, { status: 401 });
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (origin && new URL(origin).host !== host) return Response.json({ ok: false, error: 'Not allowed.' }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string' || file.size === 0) return Response.json({ ok: false, error: 'Please choose a picture.' }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ ok: false, error: 'That picture is too large.' }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = sniff(buffer);
    if (!mime) return Response.json({ ok: false, error: 'Please choose a JPG or PNG picture.' }, { status: 415 });
    await getPool().query(
      `insert into person_photos (person_id, mime, size_bytes, content) values ($1,$2,$3,$4)
       on conflict (person_id) do update set mime = excluded.mime, size_bytes = excluded.size_bytes, content = excluded.content, updated_at = now()`,
      [member.person_id, mime, buffer.length, buffer]);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[member] photo upload failed:', err?.message);
    return Response.json({ ok: false, error: 'The picture could not be saved. Please try again.' }, { status: 500 });
  }
}

export async function DELETE() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ ok: false }, { status: 401 });
  await getPool().query('delete from person_photos where person_id = $1', [member.person_id]);
  return Response.json({ ok: true });
}
