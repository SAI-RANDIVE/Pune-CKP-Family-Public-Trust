import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentAdmin, login, pruneExpired, SESSION_COOKIE } from '../../../lib/adminAuth';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Admin Sign In | Pune CKP Family Public Trust',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ searchParams }) {
  const existing = await getCurrentAdmin();
  if (existing) redirect('/admin');

  async function signIn(formData) {
    'use server';
    const email = formData.get('email');
    const password = formData.get('password');

    const { headers } = await import('next/headers');
    const h = headers();
    const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || null;

    const result = await login({ email, password, ip, userAgent: h.get('user-agent') });
    if (!result.ok) {
      redirect(`/admin/login?error=${encodeURIComponent(result.error)}`);
    }

    cookies().set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    });
    await pruneExpired();
    redirect('/admin');
  }

  const error = searchParams?.error;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-5 py-16">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="medallion medallion--gold mx-auto badge-shine" style={{ width: '4.5rem', height: '4.5rem' }}>
            <span className="font-display text-lg text-ink/80">CKP</span>
          </div>
          <h1 className="font-display text-3xl mt-6 text-ink">Trust Administration</h1>
          <p className="text-sm text-ink/60 mt-2">Sign in to manage payments, members and receipts.</p>
        </div>

        <form action={signIn} className="mt-10 bg-cream-100 border border-saffron-200 rounded-3xl p-8 space-y-5 shadow-sm">
          {error && (
            <p role="alert" className="rounded-xl bg-vermilion-50 border border-vermilion-200 px-4 py-3 text-sm text-vermilion-700">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-ink/60">Email</label>
            <input
              id="email" name="email" type="email" required autoComplete="username"
              className="mt-1.5 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-2.5 text-sm focus:border-vermilion-400 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-ink/60">Password</label>
            <input
              id="password" name="password" type="password" required autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-2.5 text-sm focus:border-vermilion-400 focus:outline-none"
            />
          </div>

          <button type="submit" className="btn-press w-full rounded-full bg-vermilion-500 text-cream-100 px-7 py-3.5 font-semibold hover:bg-vermilion-600">
            Sign in
          </button>

          <p className="text-xs text-ink/50 text-center leading-relaxed">
            Accounts are created from the server with{' '}
            <code className="font-mono text-[11px] bg-cream-300 px-1.5 py-0.5 rounded">npm run admin:create</code>.
            After 5 failed attempts the account locks for 15 minutes.
          </p>
        </form>
      </div>
    </div>
  );
}
