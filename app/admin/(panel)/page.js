import Link from 'next/link';
import { getPool } from '../../../lib/db';
import { BadgeChip, EmptyRow, PageHeader, StatCard, StatusPill, formatDate, money } from '../../../components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const pool = getPool();

  const [stats, memberStats, recent, tierSplit, emailHealth] = await Promise.all([
    pool.query(`
      select
        count(*) filter (where status = 'paid')                                     as paid_count,
        count(*) filter (where status = 'created')                                  as pending_count,
        count(*) filter (where status = 'failed')                                   as failed_count,
        coalesce(sum(amount) filter (where status = 'paid'), 0)                     as revenue,
        coalesce(sum(amount) filter (where status = 'paid'
          and paid_at >= date_trunc('month', now())), 0)                            as revenue_this_month,
        count(*) filter (where status = 'paid' and paid_at >= now() - interval '30 days') as paid_30d
      from payments
    `),
    pool.query(`
      select
        count(*)                                                                    as total,
        count(*) filter (where valid_till is null or valid_till >= current_date)     as active,
        count(*) filter (where valid_till is not null and valid_till < current_date) as expired,
        count(*) filter (where valid_till is not null
          and valid_till between current_date and current_date + interval '60 days') as expiring_soon
      from members
    `),
    pool.query(`
      select p.*, m.full_name as member_full_name, m.membership_type as member_tier
        from payments p
        left join members m on m.id = p.member_id
       order by coalesce(p.paid_at, p.created_at) desc
       limit 10
    `),
    pool.query(`
      select membership_type, count(*)::int as n
        from members
       where membership_type is not null
       group by membership_type
    `),
    pool.query(`
      select status, count(*)::int as n
        from receipt_emails
       where sent_at >= now() - interval '30 days'
       group by status
    `),
  ]);

  const s = stats.rows[0] || {};
  const ms = memberStats.rows[0] || {};
  const tiers = Object.fromEntries(tierSplit.rows.map((r) => [r.membership_type, r.n]));
  const emails = Object.fromEntries(emailHealth.rows.map((r) => [r.status, r.n]));
  const failedEmails = emails.failed || 0;

  return (
    <>
      <PageHeader title="Pune CKP Family Public Trust" subtitle="Overview">
        <div className="flex items-center gap-3 rounded-2xl border border-[#e9d5b8] bg-white px-4 py-3 shadow-sm">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-sm font-medium text-slate-700">Live from the database</span>
        </div>
      </PageHeader>

      {(Number(s.pending_count) > 0 || failedEmails > 0) && (
        <div className="mb-6 space-y-3">
          {Number(s.pending_count) > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
              <p className="text-sm font-semibold text-amber-900">
                {s.pending_count} payment{Number(s.pending_count) === 1 ? '' : 's'} started but never confirmed
              </p>
              <p className="mt-1 text-xs text-amber-800">
                These are orders created at Razorpay with no captured payment. If the webhook is configured they
                resolve themselves.{' '}
                <Link href="/admin/payments?status=created" className="font-semibold underline">Review them</Link>
              </p>
            </div>
          )}
          {failedEmails > 0 && (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-4">
              <p className="text-sm font-semibold text-red-900">{failedEmails} receipt email{failedEmails === 1 ? '' : 's'} failed in the last 30 days</p>
              <p className="mt-1 text-xs text-red-800">Check SMTP_USER / SMTP_PASS, then re-send from the payment row.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard accent label="Total collected" value={money(s.revenue)} note={`${money(s.revenue_this_month)} this month`} />
        <StatCard label="Paid transactions" value={Number(s.paid_count || 0)} note={`${Number(s.paid_30d || 0)} in the last 30 days`} />
        <StatCard label="Active memberships" value={Number(ms.active || 0)} note={`${Number(ms.expired || 0)} expired · ${Number(ms.total || 0)} total`} />
        <StatCard label="Expiring in 60 days" value={Number(ms.expiring_soon || 0)} note="Worth a renewal reminder" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-2xl border border-[#ead8be] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-900">Recent activity</h3>
            <Link href="/admin/payments" className="text-xs font-semibold text-[#c96b2b] hover:underline">View all payments →</Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f9f3ea] text-slate-700">
                <tr>
                  <th scope="col" className="px-3 py-3 font-semibold">Payer</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Receipt</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Amount</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.rows.length === 0 ? (
                  <EmptyRow colSpan={5}>No payment activity yet.</EmptyRow>
                ) : recent.rows.map((p) => (
                  <tr key={p.id} className="row-hover border-t border-slate-200">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{p.member_full_name || p.payer_name}</div>
                      <div className="text-xs text-slate-500">{p.membership_no || 'Donation'}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">{p.receipt_no || '—'}</td>
                    <td className="px-3 py-3 font-medium text-slate-800">{money(p.amount)}</td>
                    <td className="px-3 py-3"><StatusPill status={p.status} /></td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(p.paid_at || p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-[#ead8be] bg-white p-5 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900">Membership mix</h3>
          <div className="mt-5 space-y-4">
            {['platinum', 'gold', 'silver'].map((tier) => {
              const n = tiers[tier] || 0;
              const total = Object.values(tiers).reduce((a, b) => a + b, 0) || 1;
              const pct = Math.round((n / total) * 100);
              return (
                <div key={tier}>
                  <div className="flex items-center justify-between">
                    <BadgeChip type={tier} />
                    <span className="text-sm font-semibold text-slate-800">{n}</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#f2e6d4]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#F4A62C] to-[#c96b2b] transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-7 border-t border-[#ead7c2] pt-5">
            <h4 className="text-sm font-semibold text-slate-900">Receipt emails (30 days)</h4>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-semibold text-emerald-700">{emails.sent || 0} sent</span>
              {failedEmails > 0 && <span className="font-semibold text-red-700"> · {failedEmails} failed</span>}
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
