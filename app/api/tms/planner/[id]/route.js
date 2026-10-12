import { apiGuard, audit, can } from '../../../../../lib/tms/auth';
import { isUuid, one, q } from '../../../../../lib/tms/db';
import { fmtDate, todayIso } from '../../../../../lib/tms/format';
import { reportWorkbook } from '../../../../../lib/tms/excel';
import { lineTotal, planTotals } from '../../../../../lib/tms/planMath';
import { documentPdf, inr } from '../../../../../lib/pdfDoc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** An event budget plan as a PDF on the trust's letterhead (default) or an Excel sheet (?format=xlsx). */
export async function GET(request, { params }) {
  const guard = await apiGuard(request, 'viewer');
  if (guard.response) return guard.response;
  if (!isUuid(params.id)) return new Response('Not found', { status: 404 });
  const format = new URL(request.url).searchParams.get('format') === 'xlsx' ? 'xlsx' : 'pdf';
  if (format === 'xlsx' && !can(guard.admin, 'export')) return new Response('Not allowed', { status: 403 });

  try {
    const plan = await one(
      `select p.*, e.name_en as event_name, e.code as event_code, e.event_date
         from event_plans p left join events e on e.id = p.event_id where p.id = $1 and p.deleted_at is null`, [params.id]);
    if (!plan) return new Response('Not found', { status: 404 });
    plan.items = await q('select kind, label, qty, unit_amount, per_head from event_plan_items where plan_id = $1 order by sort_order', [params.id]);
    const totals = planTotals(plan);
    const base = `PCFPT-event-plan-${String(plan.code).replace(/[^A-Za-z0-9]+/g, '-')}-${todayIso()}`;
    const line = (i) => ({
      label: i.label, basis: i.per_head ? 'Per person' : 'Fixed', qty: Number(i.qty), rate: Number(i.unit_amount), total: lineTotal(i, totals.attendees),
    });
    const income = [
      ...(totals.fee > 0 ? [{ label: 'Entry fee', basis: 'Per person', qty: 1, rate: totals.fee, total: totals.entryIncome }] : []),
      ...plan.items.filter((i) => i.kind === 'income').map(line),
    ];
    const expense = plan.items.filter((i) => i.kind === 'expense').map(line);
    await audit(guard.admin, { action: 'event_plan_exported', entity: 'event_plans', entityId: params.id, detail: { format } });

    if (format === 'xlsx') {
      const columns = [
        { key: 'label', label: 'Item', type: 'text' }, { key: 'basis', label: 'Basis', type: 'text' }, { key: 'qty', label: 'Quantity', type: 'num' },
        { key: 'rate', label: 'Rate', type: 'money' }, { key: 'total', label: 'Amount', type: 'money' },
      ];
      const buffer = await reportWorkbook({
        title: `Event plan: ${plan.title}`, fy: plan.code,
        sections: [
          { title: 'Expected income', columns, rows: income, total: { label: 'Total income', total: totals.income } },
          { title: 'Expected expenses', columns, rows: expense, total: { label: 'Total expenses', total: totals.expense } },
          {
            title: 'Summary',
            columns: [{ key: 'label', label: 'Figure', type: 'text' }, { key: 'value', label: 'Value', type: 'money' }],
            rows: [
              { label: 'People expected', value: totals.attendees }, { label: 'Entry fee per person', value: totals.fee },
              { label: 'Total income', value: totals.income }, { label: 'Total expenses', value: totals.expense },
              { label: totals.balance >= 0 ? 'Surplus' : 'Shortfall', value: Math.abs(totals.balance) },
              { label: 'Cost per person', value: totals.costPerHead }, { label: 'People needed to break even', value: totals.breakEven },
              { label: 'Entry fee that covers the cost', value: totals.feeToCover },
            ],
          },
        ],
        notes: plan.notes ? [plan.notes] : [],
      }, { by: guard.admin.name, fyLabel: 'Plan', generatedLabel: 'Prepared' });
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${base}.xlsx"`, 'Cache-Control': 'no-store',
        },
      });
    }

    const columns = [{ label: 'Item', width: 4 }, { label: 'Basis', width: 1.3 }, { label: 'Quantity', width: 1, align: 'right' },
      { label: 'Rate (Rs.)', width: 1.4, align: 'right' }, { label: 'Amount (Rs.)', width: 1.6, align: 'right' }];
    const cells = (r) => [r.label, r.basis, String(r.qty), inr(r.rate), inr(r.total)];
    const pdf = await documentPdf({
      title: `Event plan: ${plan.title}`,
      subtitle: `A planning estimate, prepared on ${fmtDate(new Date())} by ${guard.admin.name}. These are expected figures, not the trust's accounts.`,
      facts: [
        ['Plan ID', plan.code], ['Event', plan.event_name ? `${plan.event_name}${plan.event_date ? ` (${fmtDate(plan.event_date)})` : ''}` : ''],
        ['People expected', String(totals.attendees)], ['Entry fee per person', totals.fee > 0 ? `Rs. ${inr(totals.fee)}` : 'None'],
        ['Total income', `Rs. ${inr(totals.income)}`], ['Total expenses', `Rs. ${inr(totals.expense)}`],
        [totals.balance >= 0 ? 'Surplus' : 'Shortfall', `Rs. ${inr(Math.abs(totals.balance))}`],
        ['Cost per person', totals.costPerHead === null ? '' : `Rs. ${inr(Math.round(totals.costPerHead))}`],
        ['People needed to break even', totals.breakEven === null ? 'Cannot break even at this fee' : String(totals.breakEven)],
        ['Entry fee that covers the cost', totals.feeToCover === null ? '' : `Rs. ${inr(totals.feeToCover)}`],
        ['Notes', plan.notes],
      ],
      sections: [
        { heading: 'Expected income', columns, rows: income.map(cells), total: ['Total income', '', '', '', inr(totals.income)], empty: 'No income is planned.' },
        { heading: 'Expected expenses', columns, rows: expense.map(cells), total: ['Total expenses', '', '', '', inr(totals.expense)], empty: 'No expense is planned.' },
      ],
      footer: `${plan.code} - event plan (estimate)`,
    });
    return new Response(pdf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${base}.pdf"`, 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[TMS] plan export failed:', err?.message);
    return new Response('The plan could not be prepared. Please try again.', { status: 500 });
  }
}
