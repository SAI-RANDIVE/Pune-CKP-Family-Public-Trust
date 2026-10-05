import { apiGuard } from '../../../../../lib/tms/auth';
import { isUuid, one } from '../../../../../lib/tms/db';
import { UPLOAD_TYPES } from '../../../../../lib/tms/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Serves an attachment to a signed-in user. Always as a download-safe type, never as a web page. */
export async function GET(request, { params }) {
  const guard = await apiGuard(request, 'viewer');
  if (guard.response) return guard.response;
  if (!isUuid(params.id)) return new Response('Not found', { status: 404 });

  try {
    const doc = await one('select file_name, mime, content from documents where id = $1 and deleted_at is null', [params.id]);
    if (!doc || !doc.content) return new Response('Not found', { status: 404 });
    const mime = UPLOAD_TYPES.includes(doc.mime) ? doc.mime : 'application/octet-stream';
    const asciiName = String(doc.file_name).replace(/[^\x20-\x7e]+/g, '_').replace(/["\\]/g, '_');
    return new Response(doc.content, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `${mime === 'application/octet-stream' ? 'attachment' : 'inline'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[TMS] document download failed:', err?.message);
    return new Response('The file could not be opened. Please try again.', { status: 500 });
  }
}
