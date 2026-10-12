import { apiGuard, audit } from '../../../../../lib/tms/auth';
import { isUuid } from '../../../../../lib/tms/db';
import { memberStatementPdf } from '../../../../../lib/memberPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A person's statement (memberships and payments on record) as a PDF, for printing at the trust office. */
export async function GET(request, { params }) {
  const guard = await apiGuard(request, 'viewer');
  if (guard.response) return guard.response;
  if (!isUuid(params.id)) return new Response('Not found', { status: 404 });
  try {
    const statement = await memberStatementPdf(params.id);
    if (!statement) return new Response('Not found', { status: 404 });
    await audit(guard.admin, { action: 'member_statement_printed', entity: 'people', entityId: params.id });
    return new Response(statement.buffer, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${statement.fileName}"`, 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[TMS] member statement failed:', err?.message);
    return new Response('The statement could not be prepared. Please try again.', { status: 500 });
  }
}
