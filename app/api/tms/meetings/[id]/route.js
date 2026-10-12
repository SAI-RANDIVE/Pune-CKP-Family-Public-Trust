import { apiGuard, audit } from '../../../../../lib/tms/auth';
import { isUuid, one, q } from '../../../../../lib/tms/db';
import { fmtDate } from '../../../../../lib/tms/format';
import { documentPdf } from '../../../../../lib/pdfDoc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KIND = { trustees: 'Trustees\' meeting', committee: 'Committee meeting', agm: 'Annual General Meeting', general: 'General meeting', other: 'Meeting' };

/**
 * The minutes of a meeting as a PDF on the trust's letterhead, with a place
 * for the chairman's and secretary's signatures. Text typed in Marathi is not
 * printed by this PDF (use the Print button on the screen for that).
 */
export async function GET(request, { params }) {
  const guard = await apiGuard(request, 'viewer');
  if (guard.response) return guard.response;
  if (!isUuid(params.id)) return new Response('Not found', { status: 404 });
  try {
    const m = await one('select * from meetings where id = $1 and deleted_at is null', [params.id]);
    if (!m) return new Response('Not found', { status: 404 });
    const actions = await q('select task, owner, due_on, done from meeting_actions where meeting_id = $1 order by sort_order', [params.id]);
    const block = (heading, textValue) => (textValue ? [{
      heading, columns: [{ label: '', width: 1 }],
      rows: String(textValue).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => [line]),
    }] : []);

    const pdf = await documentPdf({
      title: `Minutes: ${m.title}`,
      subtitle: `${KIND[m.kind] || 'Meeting'} held on ${fmtDate(m.held_on)}${m.time_text ? `, ${m.time_text}` : ''}.`,
      facts: [
        ['Meeting ID', m.code], ['Place', m.venue], ['In the chair', m.chaired_by],
        ['Next meeting', m.next_meeting_on ? fmtDate(m.next_meeting_on) : ''], ['Present', m.attendees],
      ],
      sections: [
        ...block('Agenda', m.agenda),
        ...block('Minutes', m.minutes),
        ...block('Decisions', m.decisions),
        ...(actions.length ? [{
          heading: 'Action points',
          columns: [{ label: 'What', width: 4 }, { label: 'Who', width: 1.8 }, { label: 'By', width: 1.2 }, { label: 'Status', width: 1 }],
          rows: actions.map((a) => [a.task, a.owner || '', a.due_on ? fmtDate(a.due_on) : '', a.done ? 'Done' : 'Open']),
        }] : []),
        { heading: 'Signatures', columns: [{ label: 'Chairman', width: 1 }, { label: 'Secretary', width: 1 }], rows: [[' ', ' '], [' ', ' ']] },
      ],
      footer: `${m.code} - minutes`,
    });
    await audit(guard.admin, { action: 'meeting_minutes_printed', entity: 'meetings', entityId: params.id });
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="PCFPT-minutes-${String(m.code).replace(/[^A-Za-z0-9]+/g, '-')}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[TMS] minutes PDF failed:', err?.message);
    return new Response('The minutes could not be prepared. Please try again.', { status: 500 });
  }
}
