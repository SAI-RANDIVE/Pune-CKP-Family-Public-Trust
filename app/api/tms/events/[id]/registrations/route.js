import { apiGuard, audit, can } from '../../../../../../lib/tms/auth';
import { isUuid, one, q } from '../../../../../../lib/tms/db';
import { fmtDate, todayIso } from '../../../../../../lib/tms/format';
import { reportWorkbook } from '../../../../../../lib/tms/excel';
import { documentPdf, inr } from '../../../../../../lib/pdfDoc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cap = (s) => (s ? `${String(s).charAt(0).toUpperCase()}${String(s).slice(1).replace(/_/g, ' ')}` : '');

/**
 * The registration list of one event, as an Excel sheet (?format=xlsx) or a
 * PDF on the trust's letterhead (default). Always built from the live list.
 */
export async function GET(request, { params }) {
  const guard = await apiGuard(request, 'viewer');
  if (guard.response) return guard.response;
  if (!isUuid(params.id)) return new Response('Not found', { status: 404 });
  const format = new URL(request.url).searchParams.get('format') === 'xlsx' ? 'xlsx' : 'pdf';
  if (format === 'xlsx' && !can(guard.admin, 'export')) return new Response('Not allowed', { status: 403 });

  try {
    const event = await one('select id, code, name_en, event_date, venue, starts_at_text, fee, capacity from events where id = $1 and deleted_at is null', [params.id]);
    if (!event) return new Response('Not found', { status: 404 });
    const rows = await q(
      `select r.code, r.name, r.phone, r.email, r.guests, r.amount_due, r.payment_status, r.status, r.source, r.notes, r.created_at,
              p.code as person_code,
              (select m.code from memberships m where m.person_id = r.person_id and m.deleted_at is null
                order by (m.status = 'active') desc, m.expiry_date desc nulls first limit 1) as membership_code
         from event_registrations r left join people p on p.id = r.person_id
        where r.event_id = $1 order by (r.status = 'cancelled'), r.created_at`, [params.id]);
    const live = rows.filter((r) => r.status !== 'cancelled');
    const heads = live.reduce((sum, r) => sum + 1 + Number(r.guests || 0), 0);
    const due = live.reduce((sum, r) => sum + Number(r.amount_due || 0), 0);
    const base = `PCFPT-registrations-${String(event.code).replace(/[^A-Za-z0-9]+/g, '-')}-${todayIso()}`;
    await audit(guard.admin, { action: 'event_registrations_exported', entity: 'events', entityId: params.id, detail: { format, rows: rows.length } });

    if (format === 'xlsx') {
      const buffer = await reportWorkbook({
        title: `Registrations: ${event.name_en}`, fy: event.code,
        sections: [{
          title: 'Registrations',
          columns: [
            { key: 'n', label: 'No.', type: 'num' }, { key: 'code', label: 'Registration ID', type: 'text' }, { key: 'name', label: 'Name', type: 'text' },
            { key: 'membership_code', label: 'Membership ID', type: 'text' }, { key: 'person_code', label: 'Trust ID', type: 'text' },
            { key: 'phone', label: 'Mobile', type: 'text' }, { key: 'email', label: 'E-mail', type: 'text' },
            { key: 'guests', label: 'Guests', type: 'num' }, { key: 'heads', label: 'People in all', type: 'num' },
            { key: 'amount_due', label: 'Fee due', type: 'money' }, { key: 'payment', label: 'Fee', type: 'text' },
            { key: 'status', label: 'Status', type: 'text' }, { key: 'source', label: 'Registered by', type: 'text' },
            { key: 'created_at', label: 'Registered on', type: 'date' }, { key: 'notes', label: 'Notes', type: 'text' },
          ],
          rows: rows.map((r, i) => ({ ...r, n: i + 1, heads: 1 + Number(r.guests || 0), payment: cap(r.payment_status), status: cap(r.status), source: r.source === 'admin' ? 'Trust office' : 'Member (online)' })),
          total: { name: 'Total (cancelled left out)', guests: live.reduce((s, r) => s + Number(r.guests || 0), 0), heads, amount_due: due },
        }],
      }, { by: guard.admin.name, fyLabel: 'Event', generatedLabel: 'Prepared' });
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${base}.xlsx"`, 'Cache-Control': 'no-store',
        },
      });
    }

    const pdf = await documentPdf({
      title: `Registrations: ${event.name_en}`,
      subtitle: `Prepared on ${fmtDate(new Date())} by ${guard.admin.name}.`,
      landscape: true,
      facts: [
        ['Event ID', event.code], ['Date', event.event_date ? fmtDate(event.event_date) : ''],
        ['Venue', event.venue], ['Time', event.starts_at_text],
        ['Registrations', String(live.length)], ['People expected', `${heads}${event.capacity ? ` of ${event.capacity} places` : ''}`],
        ['Fee per person', Number(event.fee) > 0 ? `Rs. ${inr(event.fee)}` : 'Free'], ['Fees due in all', due > 0 ? `Rs. ${inr(due)}` : ''],
      ],
      sections: [{
        columns: [
          { label: 'No.', width: 0.5 }, { label: 'Registration ID', width: 1.9 }, { label: 'Name', width: 2.6 }, { label: 'Membership ID', width: 1.5 },
          { label: 'Mobile', width: 1.4 }, { label: 'Guests', width: 0.7, align: 'right' }, { label: 'Fee (Rs.)', width: 1, align: 'right' },
          { label: 'Fee', width: 1 }, { label: 'Status', width: 1 }, { label: 'Signature', width: 1.6 },
        ],
        rows: rows.map((r, i) => [String(i + 1), r.code || '', r.name, r.membership_code || '', r.phone || '', String(r.guests || 0),
          Number(r.amount_due) > 0 ? inr(r.amount_due) : '', cap(r.payment_status), cap(r.status), '']),
        total: ['', '', 'Total (cancelled left out)', '', '', String(live.reduce((s, r) => s + Number(r.guests || 0), 0)), due > 0 ? inr(due) : '', '', '', ''],
        empty: 'Nobody has registered yet.',
      }],
      footer: `${event.code} - registration list`,
    });
    return new Response(pdf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${base}.pdf"`, 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[TMS] registrations export failed:', err?.message);
    return new Response('The list could not be prepared. Please try again.', { status: 500 });
  }
}
