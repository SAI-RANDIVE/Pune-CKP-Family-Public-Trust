import { getPool } from '../../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Serves an event banner or photograph to the public website. Only pictures
 * marked public, of events that are published, are ever returned; anything
 * else answers "not found". A picture never changes once stored (a new upload
 * gets a new address), so browsers may keep it for a long time.
 */
export async function GET(_request, { params }) {
  const id = String(params.id || '');
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  try {
    const { rows } = await getPool().query(
      `select m.mime, m.content from event_media m join events e on e.id = m.event_id
        where m.id = $1 and m.is_public and e.is_published and e.deleted_at is null`, [id]);
    if (!rows.length) return new Response('Not found', { status: 404 });
    return new Response(rows[0].content, {
      status: 200,
      headers: {
        'Content-Type': rows[0].mime,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('media failed:', err?.message);
    return new Response('Not available', { status: 503 });
  }
}
