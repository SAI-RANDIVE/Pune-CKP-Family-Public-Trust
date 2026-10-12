import Link from 'next/link';
import { redirect } from 'next/navigation';
import PageHero from '../../../../components/PageHero';
import { getCurrentMember } from '../../../../lib/memberAuth';
import { buildMetadata } from '../../../../lib/seo';
import { TRUST } from '../../../../lib/siteData';
import { memberSignIn, requestMemberPassword } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'Members\' Corner Sign In | Pune CKP Family Public Trust',
  description: 'Sign in to the members\' corner of Pune CKP Family Public Trust to see your membership, your payments and to register for events.',
  path: '/member/login',
  noindex: true,
});

const MESSAGES = {
  invalid: ['error', 'The ID or the password is not correct. Please check both and try again.'],
  locked: ['error', 'Too many wrong attempts. This login is locked for {m} minutes.'],
  inactive: ['error', 'This login has been switched off. Please contact the trust.'],
  rate: ['error', 'Too many attempts from this device. Please wait {m} minutes.'],
  server: ['error', 'Sign-in is not working just now. Please try again in a moment.'],
  signed_out: ['ok', 'You have signed out.'],
  reset_sent: ['ok', 'If that ID or e-mail address has a member login, a new one-time password has been e-mailed to the address the trust holds. Please check your inbox (and the spam folder).'],
  reset_need: ['error', 'Please type your trust ID, membership ID or e-mail address.'],
};

const field = 'mt-1.5 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-vermilion-400';
const label = 'text-xs font-semibold uppercase tracking-wide text-ink/65';

export default async function MemberLoginPage({ searchParams }) {
  const member = await getCurrentMember().catch(() => null);
  if (member) redirect('/member');

  const code = String(searchParams?.e || '');
  const minutes = Math.min(999, Math.max(1, Number.parseInt(searchParams?.m, 10) || 15));
  const message = MESSAGES[code];
  const forgot = searchParams?.forgot === '1';

  return (
    <>
      <PageHero
        eyebrow="Members' Corner"
        title="Sign in as a member"
        titleMr="सभासद कक्ष"
        intro="See your membership and its validity, every payment the trust has on record from you, download your statement and register for the trust's events."
        breadcrumbs={[{ label: "Members' Corner" }]}
      />

      <section className="container-page section-y">
        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-[1.1fr,0.9fr]">
          <div className="card p-6 sm:p-8">
            {message && (
              <p role={message[0] === 'error' ? 'alert' : 'status'} className={`mb-5 rounded-xl px-4 py-3 text-sm ${message[0] === 'error' ? 'bg-vermilion-50 text-vermilion-800' : 'border border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
                {message[1].replace('{m}', String(minutes))}
              </p>
            )}

            {!forgot ? (
              <form action={memberSignIn} className="space-y-5">
                <h2 className="h-card">Sign in</h2>
                <div>
                  <label className={label} htmlFor="identifier">Trust ID, membership ID or e-mail</label>
                  <input id="identifier" name="identifier" required maxLength={254} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="e.g. SLV/MEM/0012" className={`${field} font-mono`} />
                  <p className="mt-1.5 text-xs text-ink/60">Any ID the trust has given you works, including old membership numbers.</p>
                </div>
                <div>
                  <label className={label} htmlFor="password">Password</label>
                  <input id="password" name="password" type="password" required maxLength={200} autoComplete="current-password" className={field} />
                </div>
                <button type="submit" className="btn btn-lg btn-primary w-full">Sign in</button>
                <p className="text-center text-sm">
                  <Link href="/member/login?forgot=1" className="link-underline font-semibold text-vermilion-700">Forgot your password, or signing in for the first time?</Link>
                </p>
              </form>
            ) : (
              <form action={requestMemberPassword} className="space-y-5">
                <h2 className="h-card">Get a new password by e-mail</h2>
                <p className="text-sm leading-relaxed text-ink/75">
                  Type your trust ID, membership ID or the e-mail address you gave the trust. A one-time password will be sent to the e-mail address on record.
                </p>
                <div>
                  <label className={label} htmlFor="reset-id">Trust ID, membership ID or e-mail</label>
                  <input id="reset-id" name="identifier" required maxLength={254} autoCapitalize="none" spellCheck={false} className={`${field} font-mono`} />
                </div>
                <button type="submit" className="btn btn-lg btn-primary w-full">E-mail me a new password</button>
                <p className="text-center text-sm">
                  <Link href="/member/login" className="link-underline font-semibold text-vermilion-700">Back to sign in</Link>
                </p>
              </form>
            )}
          </div>

          <aside className="space-y-5 text-sm leading-relaxed text-ink/80">
            <div className="card p-6">
              <h2 className="h-card">Where do I get a login?</h2>
              <p className="mt-3">
                The trust e-mails every member their trust ID and a one-time password. If yours has not arrived, the trust may not have your e-mail address.
              </p>
              <p className="mt-3">
                Call <a href={TRUST.phoneHref} className="font-semibold text-vermilion-700">{TRUST.phoneDisplay}</a> or write to{' '}
                <a href={`mailto:${TRUST.email}`} className="break-all font-semibold text-vermilion-700">{TRUST.email}</a>.
              </p>
            </div>
            <div className="card p-6">
              <h2 className="h-card">Not a member yet?</h2>
              <p className="mt-3">Membership is open through the website and takes a few minutes.</p>
              <p className="mt-4"><Link href="/membership" className="btn btn-outline">Join the trust</Link></p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
