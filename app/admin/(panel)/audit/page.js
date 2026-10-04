import { redirect } from 'next/navigation';
import { getPool } from '../../../../lib/db';
import { getCurrentAdmin, hasRole } from '../../../../lib/adminAuth';
import { EmptyRow, PageHeader, formatDate, money } from '../../../../components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  const admin = await getCurrentAdmin();
  if (!hasRole(admin, 'admin')) redirect('/admin');

  const pool = getPool();
  const [adminLogs, paymentEvents] = await Promise.all([
    pool.query('select * from audit_logs order by created_at desc limit 60'),
    pool.query(`
      select e.*, p.payer_name, p.receipt_no
        from payment_events e
        left join payments p on p.id = e.payment_id
       order by e.created_at desc
       limit 60
    `),
  ]);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what, and when" />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#ead8be] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Admin actions</h3>
          <p className="mt-1 text-xs text-slate-500">Sign-ins, receipt re-sends and record edits. Newest first.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f9f3ea] text-slate-700">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-semibold">When</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Who</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {adminLogs.rows.length === 0 ? (
                  <EmptyRow colSpan={3}>Nothing logged yet.</EmptyRow>
                ) : adminLogs.rows.map((l) => (
                  <tr key={l.id} className="row-hover border-t border-slate-200">
                    <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{formatDate(l.created_at, true)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-700 break-all">{l.admin_email || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-semibold ${l.action.includes('failed') ? 'text-red-600' : 'text-slate-800'}`}>
                        {l.action.replace(/_/g, ' ')}
                      </span>
                      {l.entity_id && <div className="font-mono text-[10px] text-slate-400 break-all">{l.entity}: {l.entity_id}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-[#ead8be] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Payment events</h3>
          <p className="mt-1 text-xs text-slate-500">
            The reconciliation trail, independent of the Razorpay dashboard.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f9f3ea] text-slate-700">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-semibold">When</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Event</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Payment</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody>
                {paymentEvents.rows.length === 0 ? (
                  <EmptyRow colSpan={4}>No payment events recorded yet.</EmptyRow>
                ) : paymentEvents.rows.map((e) => (
                  <tr key={e.id} className="row-hover border-t border-slate-200">
                    <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{formatDate(e.created_at, true)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-semibold ${String(e.event_type).includes('fail') ? 'text-red-600' : 'text-slate-800'}`}>
                        {String(e.event_type).replace(/[._]/g, ' ')}
                      </span>
                      {e.amount && <div className="text-[11px] text-slate-500">{money(e.amount)}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-700">
                      {e.payer_name || '—'}
                      {e.receipt_no && <div className="font-mono text-[10px] text-slate-400">{e.receipt_no}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        e.source === 'webhook' ? 'bg-sky-100 text-sky-700' : e.source === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                      }`}>{e.source}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
