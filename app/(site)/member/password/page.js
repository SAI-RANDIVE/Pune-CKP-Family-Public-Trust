import { redirect } from 'next/navigation';
import PageHero from '../../../../components/PageHero';
import { getCurrentMember } from '../../../../lib/memberAuth';
import { buildMetadata } from '../../../../lib/seo';
import { changeMemberPassword } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'Choose Your Password | Members\' Corner',
  description: 'Choose the password for your member login at Pune CKP Family Public Trust.',
  path: '/member/password',
  noindex: true,
});

const ERRORS = {
  current: 'The current password is not correct.',
  match: 'The two new passwords are not the same. Please type them again.',
  same: 'Please choose a password different from the current one.',
  weak: 'Please use at least 8 characters, with both letters and numbers.',
  rate: 'Too many attempts. Please wait a few minutes.',
};

const field = 'mt-1.5 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-vermilion-400';
const label = 'text-xs font-semibold uppercase tracking-wide text-ink/65';

export default async function MemberPasswordPage({ searchParams }) {
  const member = await getCurrentMember();
  if (!member) redirect('/member/login');
  const first = searchParams?.first === '1' || member.must_change_password;
  const error = ERRORS[String(searchParams?.e || '')];

  return (
    <>
      <PageHero
        eyebrow="Members' Corner"
        title={first ? 'Choose your own password' : 'Change your password'}
        intro={first
          ? 'The password in the e-mail works only once. Choose one that only you know.'
          : 'Type your current password, then the new one twice.'}
        breadcrumbs={[{ label: "Members' Corner", href: '/member' }, { label: 'Password' }]}
      />
      <section className="container-page section-y">
        <form action={changeMemberPassword} className="card mx-auto max-w-lg space-y-5 p-6 sm:p-8">
          <input type="hidden" name="first" value={first ? '1' : '0'} />
          {error && <p role="alert" className="rounded-xl bg-vermilion-50 px-4 py-3 text-sm text-vermilion-800">{error}</p>}
          <div>
            <label className={label} htmlFor="current">{first ? 'One-time password from the e-mail' : 'Current password'}</label>
            <input id="current" name="current" type="password" required maxLength={200} autoComplete="current-password" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="next">New password</label>
            <input id="next" name="next" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={field} />
            <p className="mt-1.5 text-xs text-ink/60">At least 8 characters, with both letters and numbers.</p>
          </div>
          <div>
            <label className={label} htmlFor="again">New password, once more</label>
            <input id="again" name="again" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={field} />
          </div>
          <button type="submit" className="btn btn-lg btn-primary w-full">Save the password</button>
        </form>
      </section>
    </>
  );
}
