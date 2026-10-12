import Link from 'next/link';
import { redirect } from 'next/navigation';
import PageHero from '../../../components/PageHero';
import { getCurrentMember } from '../../../lib/memberAuth';
import { loadMemberStatement } from '../../../lib/memberPdf';
import { RENEW_WINDOW_DAYS } from '../../../lib/register';
import { buildMetadata } from '../../../lib/seo';
import { TRUST } from '../../../lib/siteData';
import { memberSignOut } from './actions';
import ProfilePhoto from '../../../components/ProfilePhoto';
import InstallApp from '../../../components/InstallApp';
import { getPool } from '../../../lib/db';
import { listFamily } from '../../../lib/family';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'My Membership | Members\' Corner',
  description: 'Your membership, payments and event registrations with Pune CKP Family Public Trust.',
  path: '/member',
  noindex: true,
});

const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
const cap = (s) => (s ? `${String(s).charAt(0).toUpperCase()}${String(s).slice(1).replace(/_/g, ' ')}` : '');
const rupees = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const KIND = {
  donation: 'Donation', membership_fee: 'Membership fee', sponsorship: 'Sponsorship', advertisement: 'Advertisement',
  event_fee: 'Event fee', csr_grant: 'CSR grant', book_sale: 'Book sale', interest: 'Interest', other: 'Other',
};
const STATUS_STYLE = {
  active: 'bg-emerald-100 text-emerald-900', lapsed: 'bg-saffron-100 text-ink', discontinued: 'bg-cream-300 text-ink/75', converted: 'bg-cream-300 text-ink/75',
};

export default async function MemberHomePage({ searchParams }) {
  const member = await getCurrentMember();
  if (!member) redirect('/member/login');
  if (member.must_change_password) redirect('/member/password?first=1');

  const data = await loadMemberStatement(member.person_id);
  if (!data) redirect('/member/login');
  const { person, memberships, payments, registrations } = data;
  const current = memberships.find((m) => m.status === 'active') || memberships[memberships.length - 1];
  const live = payments.filter((p) => !p.is_cancelled);
  const total = live.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const donated = live.filter((p) => p.kind === 'donation').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const daysLeft = current?.expiry_date ? Math.floor((new Date(current.expiry_date).getTime() - Date.now()) / 86400000) : null;
  const canRenew = current && ['silver', 'gold'].includes(current.tier) && ['active', 'lapsed'].includes(current.status) && (daysLeft === null || daysLeft <= RENEW_WINDOW_DAYS);
  const recent = [...payments].reverse();
  const [photo, family, openPolls] = await Promise.all([
    getPool().query('select 1 from person_photos where person_id = $1', [member.person_id]),
    listFamily(member.person_id),
    getPool().query('select count(*)::int as n from polls p where p.is_published and p.deleted_at is null and now() between p.opens_at and p.closes_at and not exists (select 1 from poll_votes v where v.poll_id = p.id and v.person_id = $1)', [member.person_id]),
  ]);
  const familyCount = family.filter((f) => f.status === 'confirmed').length;
  const pollsWaiting = openPolls.rows[0].n;

  return (
    <>
      <PageHero
        eyebrow="Members' Corner"
        title={`Namaskar, ${person.name_en || person.name_mr}`}
        intro="This is what the trust has on record for you. If anything is missing or wrong, please tell the trust so it can be corrected."
        breadcrumbs={[{ label: "Members' Corner" }]}
      >
        <a href="/api/member/statement" target="_blank" rel="noopener" className="btn btn-primary">Download my statement (PDF)</a>
        <Link href="/member/events" className="btn btn-outline">Events and registration</Link>
      </PageHero>

      <section className="container-page section-y space-y-8">
        {searchParams?.ok === 'password' && (
          <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Your new password has been saved.</p>
        )}

        <div className="card flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <ProfilePhoto hasPhoto={photo.rows.length > 0} name={person.name_en || person.name_mr} />
          <nav aria-label="Members' corner" className="flex flex-wrap gap-3">
            <Link href="/member/family" className="btn btn-outline">My family{familyCount ? ` (${familyCount})` : ''}</Link>
            <Link href="/member/events" className="btn btn-outline">Events</Link>
            <Link href="/member/polls" className="btn btn-outline">Polls{pollsWaiting ? ` (${pollsWaiting} waiting)` : ''}</Link>
            <Link href="/feedback" className="btn btn-outline">Suggest something</Link>
            <InstallApp />
          </nav>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="card p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Your trust ID</p>
            <p className="mt-2 break-all font-mono text-xl font-semibold text-vermilion-700">{person.code}</p>
            <p className="mt-2 text-sm text-ink/70">Quote this ID whenever you write to the trust. It never changes.</p>
          </div>
          <div className="card p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Membership</p>
            {current ? (
              <>
                <p className="mt-2 font-display text-2xl text-vermilion-700">{cap(current.tier)}</p>
                <p className="mt-1 font-mono text-sm text-ink/80">{current.code}</p>
                <p className="mt-2 text-sm text-ink/75">
                  <span className={`mr-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[current.status] || ''}`}>{cap(current.status)}</span>
                  {current.expiry_date ? `Valid until ${day(current.expiry_date)}` : current.tier === 'platinum' ? 'Lifetime membership' : 'No expiry date on record'}
                </p>
              </>
            ) : <p className="mt-2 text-sm text-ink/75">No membership is on record.</p>}
          </div>
          <div className="card p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Received by the trust from you</p>
            <p className="mt-2 font-display text-2xl text-vermilion-700">{rupees(total)}</p>
            <p className="mt-2 text-sm text-ink/75">{live.length} payment{live.length === 1 ? '' : 's'} on record{donated > 0 ? `, of which ${rupees(donated)} in donations` : ''}.</p>
          </div>
        </div>

        {canRenew && (
          <div className="card flex flex-col items-start gap-4 border-saffron-400 bg-saffron-50 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-relaxed text-ink">
              <strong className="block text-base">
                {daysLeft !== null && daysLeft < 0 ? 'Your membership has passed its validity date.' : `Your membership can be renewed now${daysLeft !== null ? ` (${daysLeft} days left)` : ''}.`}
              </strong>
              Renew online with your membership ID <span className="font-mono">{current.code}</span>. It takes two minutes and the receipt comes by e-mail.
            </p>
            <Link href="/membership" className="btn btn-primary shrink-0">Renew my membership</Link>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[0.9fr,1.1fr]">
          <div className="card p-6 sm:p-8">
            <h2 className="h-card">Your details</h2>
            <dl className="mt-5 space-y-4 text-sm">
              {[
                ['Name', person.name_en], ['Name in Marathi', person.name_mr], ['Mobile', person.phone], ['E-mail', person.email],
                ['Address', [person.address, person.city, person.pincode].filter(Boolean).join(', ')],
                ['Date of birth', person.date_of_birth ? day(person.date_of_birth) : ''], ['Blood group', person.blood_group],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink/60">{k}</dt>
                  <dd className="mt-0.5 break-words text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 rounded-xl bg-cream-200 px-4 py-3 text-sm leading-relaxed text-ink/80">
              To correct any of these, write to <a href={`mailto:${TRUST.email}?subject=${encodeURIComponent(`Correction to my details (${person.code})`)}`} className="break-all font-semibold text-vermilion-700">{TRUST.email}</a> with
              your trust ID. The trust changes the register after checking with you.
            </p>
          </div>

          <div className="card p-6 sm:p-8">
            <h2 className="h-card">Your memberships</h2>
            {memberships.length === 0 ? <p className="mt-4 text-sm text-ink/75">None on record.</p> : (
              <ul className="mt-5 divide-y divide-saffron-200/70">
                {[...memberships].reverse().map((m) => (
                  <li key={m.code} className="py-4 first:pt-0 last:pb-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <strong className="text-base text-ink">{cap(m.tier)}</strong>
                      <span className="font-mono text-sm text-ink/75">{m.code}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[m.status] || ''}`}>{cap(m.status)}</span>
                    </p>
                    <p className="mt-1 text-sm text-ink/75">
                      {m.start_date ? `From ${day(m.start_date)}` : 'Start date not recorded'}
                      {m.expiry_date ? ` to ${day(m.expiry_date)}` : m.tier === 'platinum' ? ', lifetime' : ''}
                    </p>
                    {m.old_numbers && <p className="mt-1 text-xs text-ink/60">Earlier numbers: <span className="font-mono">{m.old_numbers}</span></p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card p-6 sm:p-8">
          <h2 className="h-card">Payments the trust has received from you</h2>
          {recent.length === 0 ? <p className="mt-4 text-sm text-ink/75">No payment is on record.</p> : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-saffron-300 text-xs uppercase tracking-wide text-ink/65">
                    <th scope="col" className="py-2 pr-4 font-semibold">Date</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">For</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Receipt no.</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Trust ID</th>
                    <th scope="col" className="py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-saffron-200/70">
                  {recent.map((p) => (
                    <tr key={p.code} className={p.is_cancelled ? 'text-ink/50 line-through' : ''}>
                      <td className="whitespace-nowrap py-3 pr-4">{p.entry_date ? day(p.entry_date) : p.fy}</td>
                      <td className="py-3 pr-4">{KIND[p.kind] || cap(p.kind)}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{p.receipt_no || p.receipt_code || '—'}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{p.code}</td>
                      <td className="whitespace-nowrap py-3 text-right font-semibold">{rupees(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {registrations.length > 0 && (
          <div className="card p-6 sm:p-8">
            <h2 className="h-card">Your event registrations</h2>
            <ul className="mt-5 divide-y divide-saffron-200/70 text-sm">
              {[...registrations].reverse().map((r) => (
                <li key={r.code} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span><strong className="text-ink">{r.name_en}</strong>{r.event_date ? `, ${day(r.event_date)}` : ''}{r.guests ? ` · ${r.guests} guest${r.guests === 1 ? '' : 's'}` : ''}</span>
                  <span className="font-mono text-xs text-ink/70">{r.code} · {cap(r.status)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link href="/member/password" className="btn btn-outline">Change my password</Link>
          <form action={memberSignOut}><button type="submit" className="btn btn-outline">Sign out</button></form>
        </div>
      </section>
    </>
  );
}
