import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentAdmin, logout, SESSION_COOKIE } from '../../../lib/adminAuth';
import AdminNav from '../../../components/admin/AdminNav';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Trust Administration',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Guards every /admin route except /admin/login, which sits outside this
 * route group precisely so it can be reached while signed out.
 */
export default async function AdminPanelLayout({ children }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');

  async function signOut() {
    'use server';
    await logout();
    cookies().delete(SESSION_COOKIE);
    redirect('/admin/login');
  }

  return (
    <div className="min-h-screen bg-[#f7f2ea] text-slate-800">
      <div className="mx-auto flex max-w-[1600px] flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b border-[#e7d9c7] bg-[#fffdf9] p-5 lg:w-72 lg:border-b-0 lg:border-r lg:min-h-screen">
          <div className="mb-7 flex items-center gap-3">
            <div className="medallion medallion--gold shrink-0" style={{ width: '2.75rem', height: '2.75rem' }}>
              <span className="font-display text-[10px] text-ink/80">CKP</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c96b2b]">Admin</p>
              <h1 className="text-lg font-bold leading-tight text-slate-900">Trust Control</h1>
            </div>
          </div>

          <AdminNav role={admin.role} />

          <div className="mt-7 rounded-2xl border border-[#eddcc0] bg-[#fffaf3] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8d5b2e]">Quick actions</p>
            <div className="mt-3 space-y-2">
              <Link href="/admin/payments?status=created" className="row-hover block rounded-lg border border-[#e4d2b6] bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                Pending payments
              </Link>
              <Link href="/admin/payments?status=failed" className="row-hover block rounded-lg border border-[#e4d2b6] bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                Failed payments
              </Link>
              <Link href="/admin/members?expiring=1" className="row-hover block rounded-lg border border-[#e4d2b6] bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                Expiring memberships
              </Link>
              <Link href="/admin/emails" className="row-hover block rounded-lg border border-[#e4d2b6] bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                Unsent receipts
              </Link>
            </div>
          </div>

          <div className="mt-7 border-t border-[#ead7c2] pt-5">
            <p className="text-sm font-semibold text-slate-900">{admin.name}</p>
            <p className="text-xs text-slate-500 break-all">{admin.email}</p>
            <span className="mt-2 inline-flex rounded-full bg-[#f7efe4] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#8f4f1d] ring-1 ring-[#ead6b7]">
              {admin.role.replace('_', ' ')}
            </span>
            <form action={signOut} className="mt-4">
              <button type="submit" className="w-full rounded-lg border border-[#d7c9b2] bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-[#f7f2ea] transition-colors">
                Sign out
              </button>
            </form>
            <Link href="/" className="mt-3 block text-center text-[11px] text-slate-500 hover:text-[#c96b2b]">
              ← Back to website
            </Link>
          </div>
        </aside>

        <div className="flex-1 p-5 md:p-8">{children}</div>
      </div>
    </div>
  );
}
