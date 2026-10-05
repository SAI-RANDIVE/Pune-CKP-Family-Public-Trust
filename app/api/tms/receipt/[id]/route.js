import { apiGuard, audit } from '../../../../../lib/tms/auth';
import { isUuid } from '../../../../../lib/tms/db';
import { buildReceiptPdf, loadReceiptFacts, receiptFileName } from '../../../../../lib/tms/receiptPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Receipt PDF (print or reprint) for a receipt issued from the management system. */
export async function GET(request, { params }) {
  const guard = await apiGuard(request, 'viewer');
  if (guard.response) return guard.response;
  if (!isUuid(params.id)) return new Response('Not found', { status: 404 });

  try {
    const facts = await loadReceiptFacts(params.id);
    if (!facts || facts.deleted_at || facts.is_cancelled || facts.receipt_origin !== 'manual') {
      return new Response('Not found', { status: 404 });
    }
    const pdf = await buildReceiptPdf(facts);
    await audit(guard.admin, { action: 'receipt_printed', entity: 'income_entries', entityId: params.id, detail: { receipt: facts.receipt_code } });
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${receiptFileName(facts)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[TMS] receipt PDF failed:', err?.message);
    return new Response('The receipt could not be prepared. Please try again.', { status: 500 });
  }
}
