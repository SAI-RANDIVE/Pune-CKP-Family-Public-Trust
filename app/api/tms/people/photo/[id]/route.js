import { apiGuard } from '../../../../../../lib/tms/auth';
import { canSee } from '../../../../../../lib/tms/access';
import { isUuid, one } from '../../../../../../lib/tms/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A person's profile picture, for the trust desk. Signed-in users who may open the members section only. */
export async function GET(request, { params }) {
  const guard = await apiGuard(request, 'viewer');
  if (guard.response) return guard.response;
  if (!canSee(guard.admin, 'members') || !isUuid(params.id)) return new Response('Not found', { status: 404 });
  const row = await one('select mime, content from person_photos where person_id = $1', [params.id]);
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(row.content, {
    status: 200,
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' },
  });
}
