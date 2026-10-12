import { getCurrentMember } from '../../../../lib/memberAuth';
import { memberStatementPdf } from '../../../../lib/memberPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The signed-in member's own statement as a PDF. The person is taken from the session, never from the address. */
export async function GET() {
  const member = await getCurrentMember();
  if (!member) return new Response(null, { status: 303, headers: { Location: '/member/login' } });
  try {
    const statement = await memberStatementPdf(member.person_id);
    if (!statement) return new Response('Not found', { status: 404 });
    return new Response(statement.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${statement.fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[member] statement failed:', err?.message);
    return new Response('The statement could not be prepared. Please try again.', { status: 500 });
  }
}
