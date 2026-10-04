import Link from 'next/link';
import { getPool } from '../../../../lib/db';
import { isEmailConfigured } from '../../../../lib/email';
import { EmptyRow, PageHeader, StatCard, formatDate } from '../../../../components/admin/ui';
import { resendReceipt } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminEmailsPage() {
  const pool = getPool();

  const [deliveries, stats, otpStats, recentOtps, unsent] = await Promise.all([
    pool.query(`
      select re.*, p.receipt_no, p.payer_name, p.amount
        from receipt_emails re
        left join payments p on p.id = re.payment_id
       order by re.sent_at desc
       limit 40
    `),
    pool.query(`
      select
        count(*) filter (where status = 'sent')                                        as sent,
        count(*) filter (where status = 'failed')                                      as failed,
        count(*) filter (where status = 'sent' and sent_at >= now() - interval '7 days')   as sent_7d,
        count(*) filter (where status = 'failed' and sent_at >= now() - interval '7 days') as failed_7d
      from receipt_emails
    `),
    pool.query(`
      select
        count(*)                                                          as issued,
        count(*) filter (where consumed_at is not null)                   as consumed,
        count(*) filter (where attempts > 0)                              as with_failed_attempts,
        count(*) filter (where created_at >= now() - interval '24 hours') as last_24h
      from email_otps
    `),
    pool.query(`
      select email, purpose, attempts, max_attempts, consumed_at, expires_at, created_at
        from email_otps
       order by created_at desc
       limit 20
    `),
    // Paid payments that have never had a receipt email successfully sent.
    pool.query(`
      select p.id, p.receipt_no, p.payer_name, p.payer_email, p.amount, p.paid_at
        from payments p
       where p.status = 'paid'
         and not exists (
           select 1 from receipt_emails re
            where re.payment_id = p.id and re.status = 'sent'
         )
       order by p.paid_at desc
       limit 25
    `),
  ]);

  const s = stats.rows[0] || {};
  const o = otpStats.rows[0] || {};
  const configured = isEmailConfigured();

  return (
    <>
      <PageHeader title="Email &amp; verification" subtitle="Delivery health">
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm ${configured ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${configured ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-slate-700">
            SMTP {configured ? 'configured' : 'NOT configured'}
          </span>
        </div>
      </PageHeader>

      {!configured && (
        <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 px-5 py-4">
          <p className="text-sm font-semibold text-red-900">Receipt emails are not being sent</p>
          <p className="mt-1 text-xs text-red-800">
            Set <code className="font-mono">SMTP_USER</code> and <code className="font-mono">SMTP_PASS</code> in the
            environment. Gmail requires a 16-character App Password, not the account password.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard accent label="Receipts emailed" value={Number(s.sent || 0)} note={`${Number(s.sent_7d || 0)} in the last 7 days`} />
        <StatCard label="Delivery failures" value={Number(s.failed || 0)} note={`${Number(s.failed_7d || 0)} in the last 7 days`} />
        <StatCard label="OTPs issued" value={Number(o.issued || 0)} note={`${Number(o.last_24h || 0)} in the last 24 hours`} />
        <StatCard label="OTPs verified" value={Number(o.consumed || 0)} note={`${Number(o.with_failed_attempts || 0)} had a wrong attempt`} />
      </div>

      {unsent.rows.length > 0 && (
        <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h3 className="text-lg font-bold text-amber-900">
            {unsent.rows.length} paid receipt{unsent.rows.length === 1 ? '' : 's'} never emailed
          </h3>
          <p className="mt-1 text-xs text-amber-800">
            These payments succeeded but the donor has no email copy. Re-send them from here.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-amber-900">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Receipt</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Payer</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Paid</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {unsent.rows.map((p) => (
                  <tr key={p.id} className="border-t border-amber-200">
                    <td className="px-3 py-2.5 font-mono text-xs text-amber-900">{p.receipt_no}</td>
                    <td className="px-3 py-2.5 text-amber-900">
                      {p.payer_name}
                      <div className="text-[11px] text-amber-700 break-all">{p.payer_email}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-amber-800">{formatDate(p.paid_at, true)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <form action={resendReceipt}>
                        <input type="hidden" name="paymentId" value={p.id} />
                        <button type="submit" className="btn-press rounded-lg bg-[#c96b2b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#b65f1f]">
                          Send now
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#ead8be] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Receipt email log</h3>
          <p className="mt-1 text-xs text-slate-500">Every delivery attempt, newest first.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f9f3ea] text-slate-700">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-semibold">When</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">To</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Receipt</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.rows.length === 0 ? (
                  <EmptyRow colSpan={4}>No receipt emails sent yet.</EmptyRow>
                ) : deliveries.rows.map((d) => (
                  <tr key={d.id} className="row-hover border-t border-slate-200">
                    <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{formatDate(d.sent_at, true)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-700 break-all">{d.to_email}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">{d.receipt_no || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${d.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {d.status}
                      </span>
                      {d.error && <div className="mt-1 max-w-[220px] text-[10px] text-red-600">{d.error}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-[#ead8be] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Email verification (OTP)</h3>
          <p className="mt-1 text-xs text-slate-500">
            Codes are stored hashed — the raw code is never readable here, by design.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f9f3ea] text-slate-700">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-semibold">When</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Email</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Attempts</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">State</th>
                </tr>
              </thead>
              <tbody>
                {recentOtps.rows.length === 0 ? (
                  <EmptyRow colSpan={4}>No verification codes issued yet.</EmptyRow>
                ) : recentOtps.rows.map((r, i) => {
                  const expired = new Date(r.expires_at) < new Date();
                  const state = r.consumed_at ? 'verified' : expired ? 'expired' : 'pending';
                  const style = state === 'verified' ? 'bg-emerald-100 text-emerald-700'
                    : state === 'expired' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700';
                  return (
                    <tr key={`${r.email}-${i}`} className="row-hover border-t border-slate-200">
                      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{formatDate(r.created_at, true)}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700 break-all">{r.email}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {r.attempts}/{r.max_attempts}
                        {r.attempts >= r.max_attempts && <span className="ml-1 text-red-600 font-semibold">locked</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${style}`}>{state}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Seeing lots of failed attempts from one address? Check{' '}
            <Link href="/admin/audit" className="font-semibold text-[#c96b2b] hover:underline">the audit log</Link>.
          </p>
        </section>
      </div>
    </>
  );
}
