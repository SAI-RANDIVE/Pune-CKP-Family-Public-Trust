import Link from 'next/link';
import { getPool } from '../../../../lib/db';
import { getCurrentAdmin, hasRole } from '../../../../lib/adminAuth';
import { EmptyRow, PageHeader, StatusPill, formatDate, money } from '../../../../components/admin/ui';
import { resendReceipt } from '../actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const STATUSES = ['all', 'paid', 'created', 'failed', 'refunded'];

export default async function AdminPaymentsPage({ searchParams }) {
  const admin = await getCurrentAdmin();
  const canResend = hasRole(admin, 'accountant');

  const q = String(searchParams?.q || '').trim();
  const status = STATUSES.includes(searchParams?.status) ? searchParams.status : 'all';
  const kind = ['all', 'donation', 'membership_new', 'membership_renew'].includes(searchParams?.kind) ? searchParams.kind : 'all';
  const page = Math.max(1, Number(searchParams?.page) || 1);

  // Parameterised throughout — never string-concatenate user input into SQL.
  const where = [];
  const params = [];

  if (status !== 'all') {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  }
  if (kind !== 'all') {
    params.push(kind);
    where.push(`p.payment_kind = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where.push(`(
      p.payer_name ILIKE $${i} OR p.payer_email ILIKE $${i} OR p.payer_phone ILIKE $${i}
      OR p.receipt_no ILIKE $${i} OR p.membership_no ILIKE $${i}
      OR p.razorpay_order_id ILIKE $${i} OR p.razorpay_payment_id ILIKE $${i}
    )`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const pool = getPool();

  const countParams = [...params];
  const { rows: countRows } = await pool.query(`select count(*)::int as n from payments p ${whereSql}`, countParams);
  const total = countRows[0].n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pages);

  params.push(PAGE_SIZE, (safePage - 1) * PAGE_SIZE);
  const { rows } = await pool.query(
    `select p.*, m.full_name as member_full_name, m.profile_token,
            (select count(*)::int from receipt_emails re where re.payment_id = p.id and re.status = 'sent') as emails_sent
       from payments p
       left join members m on m.id = p.member_id
       ${whereSql}
      order by coalesce(p.paid_at, p.created_at) desc
      limit $${params.length - 1} offset $${params.length}`,
    params
  );

  const { rows: sumRows } = await pool.query(
    `select coalesce(sum(p.amount),0) as total from payments p ${whereSql ? `${whereSql} and` : 'where'} p.status = 'paid'`,
    countParams
  );

  const qs = (overrides) => {
    const sp = new URLSearchParams();
    const merged = { q, status, kind, page: safePage, ...overrides };
    Object.entries(merged).forEach(([k, v]) => {
      if (v && v !== 'all' && !(k === 'page' && v === 1)) sp.set(k, String(v));
    });
    const s = sp.toString();
    return s ? `/admin/payments?${s}` : '/admin/payments';
  };

  return (
    <>
      <PageHeader title="Payments" subtitle="Reconciliation">
        <div className="rounded-2xl border border-[#e9d5b8] bg-white px-4 py-3 text-right shadow-sm">
          <p className="text-xs text-slate-500">Matching &amp; paid</p>
          <p className="text-lg font-bold text-slate-900">{money(sumRows[0].total)}</p>
        </div>
      </PageHeader>

      {/* Filters — a plain GET form, so it works without JS and the URL is shareable */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[#ead8be] bg-white p-4 shadow-sm">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="q" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</label>
          <input
            id="q" name="q" defaultValue={q}
            placeholder="Name, email, phone, receipt no., Razorpay ID…"
            className="mt-1.5 w-full rounded-xl border border-[#e0cdb0] bg-white px-3.5 py-2.5 text-sm focus:border-[#c96b2b] focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="status" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
          <select id="status" name="status" defaultValue={status} className="mt-1.5 rounded-xl border border-[#e0cdb0] bg-white px-3 py-2.5 text-sm">
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="kind" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
          <select id="kind" name="kind" defaultValue={kind} className="mt-1.5 rounded-xl border border-[#e0cdb0] bg-white px-3 py-2.5 text-sm">
            <option value="all">All types</option>
            <option value="donation">Donation</option>
            <option value="membership_new">Membership — new</option>
            <option value="membership_renew">Membership — renewal</option>
          </select>
        </div>
        <button type="submit" className="btn-press rounded-xl bg-[#c96b2b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#b65f1f]">
          Apply
        </button>
        {(q || status !== 'all' || kind !== 'all') && (
          <Link href="/admin/payments" className="px-2 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-800">Clear</Link>
        )}
      </form>

      <section className="rounded-2xl border border-[#ead8be] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Payments, most recent first</caption>
            <thead className="bg-[#f9f3ea] text-slate-700">
              <tr>
                <th scope="col" className="px-3 py-3 font-semibold">Payer</th>
                <th scope="col" className="px-3 py-3 font-semibold">Receipt</th>
                <th scope="col" className="px-3 py-3 font-semibold">Amount</th>
                <th scope="col" className="px-3 py-3 font-semibold">Type</th>
                <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                <th scope="col" className="px-3 py-3 font-semibold">Date</th>
                <th scope="col" className="px-3 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={7}>No payments match these filters.</EmptyRow>
              ) : rows.map((p) => (
                <tr key={p.id} className="row-hover border-t border-slate-200 align-top">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-900">{p.member_full_name || p.payer_name}</div>
                    <div className="text-xs text-slate-500 break-all">{p.payer_email}</div>
                    <div className="text-xs text-slate-400">{p.payer_phone}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-mono text-xs text-slate-800">{p.receipt_no || '—'}</div>
                    {p.membership_no && <div className="font-mono text-[11px] text-[#c96b2b]">{p.membership_no}</div>}
                    {p.razorpay_payment_id && <div className="font-mono text-[10px] text-slate-400 break-all">{p.razorpay_payment_id}</div>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.email_verified && (
                        <span className="inline-flex rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 ring-1 ring-emerald-200">email verified</span>
                      )}
                      {p.status === 'paid' && (
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${p.emails_sent > 0 ? 'bg-sky-50 text-sky-700 ring-sky-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                          {p.emails_sent > 0 ? `emailed ×${p.emails_sent}` : 'not emailed'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-medium text-slate-800">{money(p.amount)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{String(p.payment_kind || '').replace('_', ' ')}</td>
                  <td className="px-3 py-3">
                    <StatusPill status={p.status} />
                    {p.failure_reason && <div className="mt-1 max-w-[160px] text-[10px] text-red-600">{p.failure_reason}</div>}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{formatDate(p.paid_at || p.created_at, true)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-end gap-1.5">
                      {p.status === 'paid' && (
                        <>
                          <a href={`/api/receipt/${p.id}`} className="text-xs font-semibold text-[#c96b2b] hover:underline">Receipt PDF</a>
                          {canResend && (
                            <form action={resendReceipt}>
                              <input type="hidden" name="paymentId" value={p.id} />
                              <button type="submit" className="text-xs font-semibold text-slate-600 hover:text-[#c96b2b] hover:underline">
                                Re-send email{p.emails_sent > 0 ? ` (${p.emails_sent})` : ''}
                              </button>
                            </form>
                          )}
                        </>
                      )}
                      {p.profile_token && (
                        <a href={`/profile/${p.profile_token}`} className="text-xs text-slate-500 hover:text-[#c96b2b] hover:underline">Profile</a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <nav aria-label="Pagination" className="flex items-center justify-between border-t border-[#ead7c2] px-4 py-3">
            <p className="text-xs text-slate-500">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              {safePage > 1 && (
                <Link href={qs({ page: safePage - 1 })} className="rounded-lg border border-[#d7c9b2] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#f7f2ea]">Previous</Link>
              )}
              {safePage < pages && (
                <Link href={qs({ page: safePage + 1 })} className="rounded-lg border border-[#d7c9b2] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#f7f2ea]">Next</Link>
              )}
            </div>
          </nav>
        )}
      </section>
    </>
  );
}
