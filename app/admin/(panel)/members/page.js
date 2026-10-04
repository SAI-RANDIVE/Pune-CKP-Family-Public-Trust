import Link from 'next/link';
import { getPool } from '../../../../lib/db';
import { BadgeChip, EmptyRow, PageHeader, formatDate, money } from '../../../../components/admin/ui';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function AdminMembersPage({ searchParams }) {
  const q = String(searchParams?.q || '').trim();
  const tier = ['all', 'silver', 'gold', 'platinum'].includes(searchParams?.tier) ? searchParams.tier : 'all';
  const expiring = searchParams?.expiring === '1';
  const state = ['all', 'active', 'expired'].includes(searchParams?.state) ? searchParams.state : 'all';
  const page = Math.max(1, Number(searchParams?.page) || 1);

  const where = [];
  const params = [];

  if (tier !== 'all') {
    params.push(tier);
    where.push(`m.membership_type = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where.push(`(m.full_name ILIKE $${i} OR m.email ILIKE $${i} OR m.phone ILIKE $${i} OR m.membership_no ILIKE $${i})`);
  }
  if (expiring) {
    where.push("m.valid_till is not null and m.valid_till between current_date and current_date + interval '60 days'");
  } else if (state === 'active') {
    where.push('(m.valid_till is null or m.valid_till >= current_date)');
  } else if (state === 'expired') {
    where.push('m.valid_till is not null and m.valid_till < current_date');
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const pool = getPool();

  const { rows: countRows } = await pool.query(`select count(*)::int as n from members m ${whereSql}`, params);
  const total = countRows[0].n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pages);

  const listParams = [...params, PAGE_SIZE, (safePage - 1) * PAGE_SIZE];
  const { rows } = await pool.query(
    `select m.*,
            (select coalesce(sum(p.amount),0) from payments p where p.member_id = m.id and p.status = 'paid') as total_paid,
            (select count(*)::int from payments p where p.member_id = m.id and p.status = 'paid')            as payment_count
       from members m
       ${whereSql}
      order by m.created_at desc
      limit $${listParams.length - 1} offset $${listParams.length}`,
    listParams
  );

  const qs = (o) => {
    const sp = new URLSearchParams();
    Object.entries({ q, tier, state, expiring: expiring ? '1' : '', page: safePage, ...o }).forEach(([k, v]) => {
      if (v && v !== 'all' && !(k === 'page' && v === 1)) sp.set(k, String(v));
    });
    const s = sp.toString();
    return s ? `/admin/members?${s}` : '/admin/members';
  };

  return (
    <>
      <PageHeader title="Members" subtitle={expiring ? 'Expiring within 60 days' : 'Directory'}>
        <div className="rounded-2xl border border-[#e9d5b8] bg-white px-4 py-3 text-right shadow-sm">
          <p className="text-xs text-slate-500">Matching members</p>
          <p className="text-lg font-bold text-slate-900">{total}</p>
        </div>
      </PageHeader>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[#ead8be] bg-white p-4 shadow-sm">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="q" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Name, email, phone or membership no."
            className="mt-1.5 w-full rounded-xl border border-[#e0cdb0] bg-white px-3.5 py-2.5 text-sm focus:border-[#c96b2b] focus:outline-none" />
        </div>
        <div>
          <label htmlFor="tier" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tier</label>
          <select id="tier" name="tier" defaultValue={tier} className="mt-1.5 rounded-xl border border-[#e0cdb0] bg-white px-3 py-2.5 text-sm">
            <option value="all">All tiers</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
            <option value="platinum">Platinum</option>
          </select>
        </div>
        <div>
          <label htmlFor="state" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
          <select id="state" name="state" defaultValue={state} className="mt-1.5 rounded-xl border border-[#e0cdb0] bg-white px-3 py-2.5 text-sm">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <button type="submit" className="btn-press rounded-xl bg-[#c96b2b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#b65f1f]">Apply</button>
        {(q || tier !== 'all' || state !== 'all' || expiring) && (
          <Link href="/admin/members" className="px-2 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-800">Clear</Link>
        )}
      </form>

      <section className="rounded-2xl border border-[#ead8be] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Members, newest first</caption>
            <thead className="bg-[#f9f3ea] text-slate-700">
              <tr>
                <th scope="col" className="px-3 py-3 font-semibold">Member</th>
                <th scope="col" className="px-3 py-3 font-semibold">Tier</th>
                <th scope="col" className="px-3 py-3 font-semibold">Number</th>
                <th scope="col" className="px-3 py-3 font-semibold">Validity</th>
                <th scope="col" className="px-3 py-3 font-semibold">Contributed</th>
                <th scope="col" className="px-3 py-3 font-semibold text-right">Profile</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={6}>No members match these filters.</EmptyRow>
              ) : rows.map((m) => {
                const expired = m.valid_till && new Date(m.valid_till) < new Date();
                return (
                  <tr key={m.id} className="row-hover border-t border-slate-200 align-top">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{m.full_name}</div>
                      <div className="text-xs text-slate-500 break-all">{m.email}</div>
                      <div className="text-xs text-slate-400">{m.phone}</div>
                    </td>
                    <td className="px-3 py-3"><BadgeChip type={m.membership_type} /></td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">{m.membership_no || '—'}</td>
                    <td className="px-3 py-3">
                      {!m.valid_till ? (
                        <span className="text-xs font-semibold text-emerald-700">Lifetime</span>
                      ) : (
                        <span className={`text-xs font-semibold ${expired ? 'text-red-600' : 'text-slate-700'}`}>
                          {expired ? 'Expired ' : 'Until '}{formatDate(m.valid_till)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-800">{money(m.total_paid)}</div>
                      <div className="text-[11px] text-slate-500">{m.payment_count} payment{m.payment_count === 1 ? '' : 's'}</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {m.profile_token
                        ? <a href={`/profile/${m.profile_token}`} className="text-xs font-semibold text-[#c96b2b] hover:underline">Open</a>
                        : <span className="text-xs text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <nav aria-label="Pagination" className="flex items-center justify-between border-t border-[#ead7c2] px-4 py-3">
            <p className="text-xs text-slate-500">Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, total)} of {total}</p>
            <div className="flex gap-2">
              {safePage > 1 && <Link href={qs({ page: safePage - 1 })} className="rounded-lg border border-[#d7c9b2] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#f7f2ea]">Previous</Link>}
              {safePage < pages && <Link href={qs({ page: safePage + 1 })} className="rounded-lg border border-[#d7c9b2] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#f7f2ea]">Next</Link>}
            </div>
          </nav>
        )}
      </section>
    </>
  );
}
